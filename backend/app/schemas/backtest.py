from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.strategy import Timeframe


class BuiltinRef(BaseModel):
    type: Literal["builtin"]
    key: str
    params: dict[str, float] | None = None


class SavedRef(BaseModel):
    type: Literal["saved"]
    strategy_id: int


class DefinitionRef(BaseModel):
    type: Literal["definition"]
    definition: dict


StrategyRef = Annotated[Union[BuiltinRef, SavedRef, DefinitionRef], Field(discriminator="type")]


class BacktestRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    symbol: str = Field(min_length=1, max_length=32)
    strategy: StrategyRef
    timeframe: Timeframe = "1d"
    start: str | None = None
    end: str | None = None
    initial_capital: float = Field(default=100000.0, gt=0, le=1e11)
    position_size_pct: float = Field(default=100.0, gt=0, le=100)
    brokerage_pct: float = Field(default=0.03, ge=0, le=5)
    brokerage_flat: float = Field(default=20.0, ge=0, le=100000)
    transaction_cost_pct: float = Field(default=0.1, ge=0, le=5)
    slippage_bps: float = Field(default=5.0, ge=0, le=500)
    stop_loss_pct: float | None = Field(default=None, gt=0, lt=100)
    take_profit_pct: float | None = Field(default=None, gt=0, le=1000)
    out_of_sample_pct: float = Field(default=0.0, ge=0, le=90)


class CompareRequest(BaseModel):
    base: dict
    strategies: list[StrategyRef] = Field(min_length=1, max_length=10)
