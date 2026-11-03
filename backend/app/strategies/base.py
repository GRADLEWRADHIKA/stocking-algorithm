"""Strategy primitives.

A strategy is a list of BUY conditions and SELL conditions computed as vectorized, causal boolean
arrays over the bar series. `entries`/`exits` are derived from the *required* conditions, so the
conditions reported in a Signal are exactly what generated the action. Optional conditions only
contribute to the strength score.

Strength score (0-100, NOT a probability):
  score = 100 * sum_i(w_i * m_i) / sum_i(w_i)
where m_i in [0, 1] is a normalized condition margin:
  * event conditions (crossovers/breakouts) contribute 1.0 when they occur on the bar; otherwise a
    proximity measure (how close the operands are) so HOLD scores show how near a setup is;
  * level conditions contribute clip(distance / scale, 0, 1) when satisfied, else 0.
Labels: score < 40 -> WEAK, 40-69.99 -> MODERATE, >= 70 -> STRONG.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

STRENGTH_METHOD = (
    "Deterministic weighted sum of normalized condition margins: score = 100 * sum(w_i * m_i) / sum(w_i), "
    "m_i in [0,1] (events = 1 when triggered, else proximity; levels = clipped distance / scale). "
    "Labels: <40 WEAK, 40-69 MODERATE, >=70 STRONG. Not a probability of profit."
)


def label_for(score: float) -> str:
    return "STRONG" if score >= 70 else "MODERATE" if score >= 40 else "WEAK"


def clip01(x) -> np.ndarray:
    a = np.asarray(x, dtype=float)
    return np.clip(np.nan_to_num(a, nan=0.0, posinf=1.0, neginf=0.0), 0.0, 1.0)


def nz_bool(x) -> np.ndarray:
    a = np.asarray(x)
    if a.dtype == bool:
        return a
    return np.nan_to_num(a.astype(float), nan=0.0).astype(bool)


@dataclass(eq=False)
class Cond:
    description: str
    satisfied: np.ndarray
    value: np.ndarray
    margin: np.ndarray
    weight: float = 1.0
    required: bool = True
    fmt: str = "{:.2f}"

    def value_at(self, i: int) -> str | None:
        v = self.value[i] if len(self.value) else np.nan
        if v is None or (isinstance(v, float) and np.isnan(v)) or (isinstance(v, np.floating) and np.isnan(v)):
            return None
        try:
            return self.fmt.format(float(v))
        except (TypeError, ValueError):
            return str(v)


@dataclass
class StrategyOutput:
    buy: list[Cond]
    sell: list[Cond]
    indicators: dict[str, np.ndarray]
    entry_text: list[str]
    exit_text: list[str]
    sell_logic: str = "any"  # 'any' or 'all' over required sell conditions
    warmup_bars: int = 0
    buy_logic: str = "all"

    @staticmethod
    def _combine(conds: list[Cond], logic: str, n: int) -> np.ndarray:
        req = [nz_bool(c.satisfied) for c in conds if c.required]
        if not req:
            return np.zeros(n, dtype=bool)
        if logic == "all":
            return np.logical_and.reduce(req)
        return np.logical_or.reduce(req)

    def entries(self, n: int) -> np.ndarray:
        return self._combine(self.buy, self.buy_logic, n)

    def exits(self, n: int) -> np.ndarray:
        return self._combine(self.sell, self.sell_logic, n)


def score_conditions(conds: list[Cond], i: int) -> tuple[float, list[dict]]:
    total_w = sum(c.weight for c in conds) or 1.0
    comps = []
    acc = 0.0
    for c in conds:
        m = float(clip01(c.margin[i:i + 1])[0]) if len(c.margin) > i else 0.0
        acc += c.weight * m
        comps.append({"name": c.description, "weight": round(c.weight / total_w, 4), "value": round(m, 4)})
    return round(100.0 * acc / total_w, 2), comps


@dataclass(frozen=True)
class ParamDef:
    name: str
    label: str
    type: str
    default: float
    min: float
    max: float


@dataclass
class BuiltinStrategy:
    key: str
    name: str
    description: str
    params: list[ParamDef]
    builder: object = field(repr=False)  # callable(df, params) -> StrategyOutput

    def resolve(self, params: dict | None) -> dict[str, float]:
        params = dict(params or {})
        out: dict[str, float] = {}
        known = {p.name for p in self.params}
        unknown = set(params) - known
        if unknown:
            raise ValueError(f"Unknown parameter(s) for {self.key}: {', '.join(sorted(unknown))}")
        for p in self.params:
            v = params.get(p.name, p.default)
            try:
                v = float(v)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Parameter {p.name} must be numeric") from exc
            if v < p.min or v > p.max:
                raise ValueError(f"Parameter {p.name}={v:g} out of range [{p.min:g}, {p.max:g}]")
            out[p.name] = int(round(v)) if p.type == "int" else v
        for a, b in (("fast", "slow"), ("fast", "mid"), ("mid", "slow")):
            if a in out and b in out and out[a] >= out[b]:
                raise ValueError(f"Parameter {a} ({out[a]:g}) must be smaller than {b} ({out[b]:g})")
        return out

    def run(self, df: pd.DataFrame, params: dict | None = None) -> StrategyOutput:
        return self.builder(df, self.resolve(params))  # type: ignore[operator]

    def to_payload(self) -> dict:
        return {
            "key": self.key, "name": self.name, "description": self.description,
            "params": [{"name": p.name, "label": p.label, "type": p.type, "default": p.default, "min": p.min,
                        "max": p.max} for p in self.params],
        }
