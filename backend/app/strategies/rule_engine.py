"""Strategy-builder rule engine.

SAFE evaluation: no eval/exec. A StrategyDefinition is parsed with Pydantic, semantically validated
against the indicator registry, and evaluated by resolving each operand to a numeric array (indicator
outputs, price fields or constants) and applying a whitelisted comparison operator:
  >, <, >=, <=                 elementwise comparison (NaN -> False)
  crosses_above / crosses_below  a[t] > b[t] and a[t-1] <= b[t-1] (and mirror)
Groups combine conditions with AND / OR. The result is a StrategyOutput, so the same backtester and
signal builder are used for built-in and custom strategies.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from pydantic import ValidationError

from app.indicators import core
from app.indicators.registry import CATALOG, IndicatorError, compute, display_name, resolve_params
from app.schemas.strategy import (
    ConstantOperand,
    IndicatorOperand,
    PriceOperand,
    RuleCondition,
    RuleGroup,
    StrategyDefinition,
)
from app.strategies.base import Cond, StrategyOutput, clip01

OP_TEXT = {">": ">", "<": "<", ">=": ">=", "<=": "<=", "crosses_above": "crosses above", "crosses_below": "crosses below"}


def _pyd_errors(exc: ValidationError) -> list[str]:
    out = []
    for e in exc.errors():
        loc = ".".join(str(p) for p in e.get("loc", ()))
        out.append(f"{loc}: {e.get('msg')}" if loc else str(e.get("msg")))
    return out


def _operand_errors(op, where: str) -> list[str]:
    errs: list[str] = []
    if isinstance(op, IndicatorOperand):
        key = op.indicator.lower()
        if key not in CATALOG:
            return [f"{where}: unknown indicator '{op.indicator}' (available: {', '.join(CATALOG)})"]
        try:
            resolve_params(key, op.params)
        except IndicatorError as exc:
            errs.append(f"{where}: {exc}")
        fields = CATALOG[key].fields
        if op.field is not None and op.field not in fields:
            errs.append(f"{where}: invalid field '{op.field}' for {key} (valid: {', '.join(fields)})")
    return errs


def _group_errors(group: RuleGroup, name: str) -> list[str]:
    errs: list[str] = []
    if not group.conditions:
        errs.append(f"{name}: rule group must contain at least one condition")
    if len(group.conditions) > 20:
        errs.append(f"{name}: at most 20 conditions per group")
    for i, cond in enumerate(group.conditions):
        where = f"{name}.conditions[{i}]"
        errs += _operand_errors(cond.left, f"{where}.left")
        errs += _operand_errors(cond.right, f"{where}.right")
        if isinstance(cond.left, ConstantOperand) and isinstance(cond.right, ConstantOperand):
            errs.append(f"{where}: comparing two constants is always true or false")
    return errs


def validate_definition(raw: dict | StrategyDefinition) -> tuple[StrategyDefinition | None, list[str]]:
    if isinstance(raw, StrategyDefinition):
        defn = raw
    else:
        if not isinstance(raw, dict):
            return None, ["definition must be an object"]
        try:
            defn = StrategyDefinition.model_validate(raw)
        except ValidationError as exc:
            return None, _pyd_errors(exc)
    errs = _group_errors(defn.entry, "entry") + _group_errors(defn.exit, "exit")
    return (defn if not errs else None), errs


def operand_label(op) -> str:
    if isinstance(op, IndicatorOperand):
        key = op.indicator.lower()
        p = resolve_params(key, op.params)
        fld = op.field or CATALOG[key].fields[0]
        name = display_name(key, p)
        return name if fld == "value" else f"{name}.{fld}"
    if isinstance(op, PriceOperand):
        return op.field.capitalize()
    return f"{op.value:g}"


class _Resolver:
    def __init__(self, df: pd.DataFrame):
        self.df = df
        self._cache: dict[tuple, dict[str, np.ndarray]] = {}

    def __call__(self, op) -> np.ndarray:
        n = len(self.df)
        if isinstance(op, ConstantOperand):
            return np.full(n, float(op.value))
        if isinstance(op, PriceOperand):
            return self.df[op.field].to_numpy(dtype=float)
        key = op.indicator.lower()
        p = resolve_params(key, op.params)
        ck = (key, tuple(sorted(p.items())))
        if ck not in self._cache:
            self._cache[ck] = compute(key, self.df, p)
        fld = op.field or CATALOG[key].fields[0]
        return np.asarray(self._cache[ck][fld], dtype=float)


def _condition(cond: RuleCondition, resolve: _Resolver, required: bool = True) -> Cond:
    a, b = resolve(cond.left), resolve(cond.right)
    op = cond.operator
    with np.errstate(invalid="ignore", divide="ignore"):
        if op == ">":
            sat = a > b
        elif op == ">=":
            sat = a >= b
        elif op == "<":
            sat = a < b
        elif op == "<=":
            sat = a <= b
        elif op == "crosses_above":
            sat = core.crosses_above(a, b)
        else:
            sat = core.crosses_below(a, b)
        sat = np.nan_to_num(sat, nan=0).astype(bool) & ~np.isnan(a) & ~np.isnan(b)
        scale = np.abs(b) * 0.05 + 1e-9
        diff = (a - b) / scale
    if op in (">", ">="):
        margin = np.where(sat, clip01(diff), 0.0)
    elif op in ("<", "<="):
        margin = np.where(sat, clip01(-diff), 0.0)
    else:
        margin = np.where(sat, 1.0, clip01(1 - np.abs(diff)) * 0.8)
    desc = f"{operand_label(cond.left)} {OP_TEXT[op]} {operand_label(cond.right)}"
    return Cond(desc, sat, a, margin, 1.0, required)


def evaluate_definition(defn: StrategyDefinition, df: pd.DataFrame) -> StrategyOutput:
    resolve = _Resolver(df)
    buy = [_condition(c, resolve) for c in defn.entry.conditions]
    sell = [_condition(c, resolve) for c in defn.exit.conditions]
    indicators: dict[str, np.ndarray] = {}
    warm = 0
    for cond in defn.entry.conditions + defn.exit.conditions:
        for op in (cond.left, cond.right):
            if isinstance(op, IndicatorOperand):
                indicators[operand_label(op)] = resolve(op)
                p = resolve_params(op.indicator.lower(), op.params)
                warm = max(warm, int(sum(v for v in p.values() if isinstance(v, int))))
    indicators["close"] = df["close"].to_numpy(dtype=float)
    joiner_e = " AND " if defn.entry.logic == "AND" else " OR "
    joiner_x = " AND " if defn.exit.logic == "AND" else " OR "
    return StrategyOutput(
        buy=buy, sell=sell, indicators=indicators,
        entry_text=[joiner_e.join(c.description for c in buy)], exit_text=[joiner_x.join(c.description for c in sell)],
        sell_logic="all" if defn.exit.logic == "AND" else "any",
        buy_logic="all" if defn.entry.logic == "AND" else "any", warmup_bars=warm,
    )


def definition_rows(defn: StrategyDefinition) -> list[dict]:
    """Normalized rows for the strategy_conditions table."""
    rows = []
    for gtype, group in (("ENTRY", defn.entry), ("EXIT", defn.exit)):
        for i, c in enumerate(group.conditions):
            rows.append({"group_type": gtype, "group_logic": group.logic, "position": i,
                         "left_operand": c.left.model_dump(exclude_none=True), "operator": c.operator,
                         "right_operand": c.right.model_dump(exclude_none=True)})
    return rows
