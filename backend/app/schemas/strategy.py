from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

Timeframe = Literal["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]
ComparisonOperator = Literal[">", "<", ">=", "<=", "crosses_above", "crosses_below"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class IndicatorOperand(_Strict):
    type: Literal["indicator"]
    indicator: str
    params: dict[str, float] = Field(default_factory=dict)
    field: str | None = None


class PriceOperand(_Strict):
    type: Literal["price"]
    field: Literal["open", "high", "low", "close", "volume"]


class ConstantOperand(_Strict):
    type: Literal["constant"]
    value: float


Operand = Annotated[Union[IndicatorOperand, PriceOperand, ConstantOperand], Field(discriminator="type")]


class RuleCondition(_Strict):
    left: Operand
    operator: ComparisonOperator
    right: Operand


class RuleGroup(_Strict):
    logic: Literal["AND", "OR"]
    conditions: list[RuleCondition]


class RiskConfig(_Strict):
    stop_loss_pct: float | None = Field(default=None, gt=0, lt=100)
    take_profit_pct: float | None = Field(default=None, gt=0, le=1000)
    position_size_pct: float = Field(default=100.0, gt=0, le=100)


class StrategyDefinition(_Strict):
    entry: RuleGroup
    exit: RuleGroup
    risk: RiskConfig = Field(default_factory=RiskConfig)
    timeframe: Timeframe = "1d"


class SavedStrategyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    definition: dict


class StrategyUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    definition: dict | None = None


class ValidateIn(BaseModel):
    definition: dict


class EvaluateIn(BaseModel):
    definition: dict
    symbol: str
    timeframe: Timeframe | None = None
