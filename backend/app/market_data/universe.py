"""Simulated instrument universe.

Tickers, company names, sectors and ISINs refer to real NSE-listed companies for realism, but
EVERY price, volume and fundamental value produced for them by QuantDesk is SIMULATED
(data_source='SIMULATED'). anchor_price / market_cap are only magnitude anchors for the simulator.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class UniverseStock:
    symbol: str
    name: str
    sector: str
    industry: str
    isin: str
    anchor_price: float  # simulated last close is rebased to this magnitude
    mcap_crore: float  # approximate magnitude (INR crore) used for cap weights
    pe: float
    pb: float
    div_yield: float
    face_value: float
    beta: float
    midcap: bool = False
    sensex: bool = False


U = UniverseStock
UNIVERSE: list[UniverseStock] = [
    # Banking
    U("HDFCBANK", "HDFC Bank Ltd", "Banking", "Private Sector Bank", "INE040A01034", 985, 1510000, 20.5, 2.7, 1.1, 1, 0.95, sensex=True),
    U("ICICIBANK", "ICICI Bank Ltd", "Banking", "Private Sector Bank", "INE090A01021", 1390, 990000, 19.0, 3.2, 0.8, 2, 1.05, sensex=True),
    U("SBIN", "State Bank of India", "Banking", "Public Sector Bank", "INE062A01020", 870, 776000, 10.2, 1.6, 1.8, 1, 1.20, sensex=True),
    U("KOTAKBANK", "Kotak Mahindra Bank Ltd", "Banking", "Private Sector Bank", "INE237A01028", 2090, 415000, 21.0, 2.9, 0.1, 5, 0.90, sensex=True),
    U("AXISBANK", "Axis Bank Ltd", "Banking", "Private Sector Bank", "INE238A01034", 1160, 360000, 13.5, 2.0, 0.1, 2, 1.15, sensex=True),
    U("INDUSINDBK", "IndusInd Bank Ltd", "Banking", "Private Sector Bank", "INE095A01012", 780, 61000, 11.0, 1.1, 2.1, 10, 1.30),
    U("BANKBARODA", "Bank of Baroda", "Banking", "Public Sector Bank", "INE028A01039", 250, 129000, 6.5, 0.9, 3.0, 2, 1.35),
    U("AUBANK", "AU Small Finance Bank Ltd", "Banking", "Small Finance Bank", "INE949L01017", 760, 56000, 26.0, 3.4, 0.1, 10, 1.10, midcap=True),
    U("FEDERALBNK", "The Federal Bank Ltd", "Banking", "Private Sector Bank", "INE171A01029", 205, 50000, 12.5, 1.4, 0.6, 2, 1.10, midcap=True),
    # IT
    U("TCS", "Tata Consultancy Services Ltd", "IT", "IT Services", "INE467B01029", 3480, 1260000, 26.0, 13.5, 1.6, 1, 0.75, sensex=True),
    U("INFY", "Infosys Ltd", "IT", "IT Services", "INE009A01021", 1510, 627000, 23.5, 7.4, 2.6, 5, 0.85, sensex=True),
    U("HCLTECH", "HCL Technologies Ltd", "IT", "IT Services", "INE860A01027", 1540, 418000, 25.0, 6.3, 3.4, 2, 0.80, sensex=True),
    U("WIPRO", "Wipro Ltd", "IT", "IT Services", "INE075A01022", 252, 264000, 20.0, 3.4, 0.4, 2, 0.80),
    U("TECHM", "Tech Mahindra Ltd", "IT", "IT Services", "INE669C01036", 1480, 145000, 35.0, 5.4, 3.0, 5, 0.95, sensex=True),
    U("PERSISTENT", "Persistent Systems Ltd", "IT", "IT Services", "INE262H01021", 5600, 87000, 58.0, 14.5, 0.6, 5, 1.20, midcap=True),
    U("COFORGE", "Coforge Ltd", "IT", "IT Services", "INE591G01017", 1720, 57000, 55.0, 11.0, 0.9, 2, 1.25, midcap=True),
    # Energy / Power
    U("RELIANCE", "Reliance Industries Ltd", "Energy", "Refineries & Petrochemicals", "INE002A01018", 1420, 1920000, 24.0, 2.3, 0.4, 10, 1.00, sensex=True),
    U("ONGC", "Oil & Natural Gas Corporation Ltd", "Energy", "Oil Exploration", "INE213A01029", 245, 308000, 8.0, 0.9, 5.0, 5, 0.95),
    U("NTPC", "NTPC Ltd", "Energy", "Power Generation", "INE733E01010", 340, 330000, 14.0, 1.8, 2.4, 10, 0.85, sensex=True),
    U("POWERGRID", "Power Grid Corporation of India Ltd", "Energy", "Power Transmission", "INE752E01010", 295, 274000, 17.0, 3.0, 4.2, 10, 0.75, sensex=True),
    U("TATAPOWER", "Tata Power Company Ltd", "Energy", "Integrated Power Utilities", "INE245A01021", 395, 126000, 31.0, 3.8, 0.6, 1, 1.25, midcap=True),
    U("COALINDIA", "Coal India Ltd", "Energy", "Coal", "INE522F01014", 390, 240000, 7.2, 2.6, 6.5, 10, 0.80),
    # FMCG
    U("HINDUNILVR", "Hindustan Unilever Ltd", "FMCG", "Personal Care", "INE030A01027", 2440, 573000, 54.0, 11.0, 1.7, 1, 0.55, sensex=True),
    U("ITC", "ITC Ltd", "FMCG", "Diversified FMCG", "INE154A01025", 412, 515000, 25.0, 7.0, 3.4, 1, 0.60, sensex=True),
    U("NESTLEIND", "Nestle India Ltd", "FMCG", "Packaged Foods", "INE239A01024", 1210, 233000, 68.0, 55.0, 1.2, 1, 0.50, sensex=True),
    U("BRITANNIA", "Britannia Industries Ltd", "FMCG", "Packaged Foods", "INE216A01030", 5850, 141000, 62.0, 33.0, 1.3, 1, 0.55),
    U("DABUR", "Dabur India Ltd", "FMCG", "Personal Care", "INE016A01026", 505, 89000, 49.0, 9.0, 1.1, 1, 0.55, midcap=True),
    # Auto
    U("MARUTI", "Maruti Suzuki India Ltd", "Auto", "Passenger Cars", "INE585B01010", 15200, 478000, 31.0, 5.4, 0.9, 5, 0.80, sensex=True),
    U("TATAMOTORS", "Tata Motors Ltd", "Auto", "Passenger & Commercial Vehicles", "INE155A01022", 690, 254000, 10.5, 2.4, 0.9, 2, 1.40, sensex=True),
    U("M&M", "Mahindra & Mahindra Ltd", "Auto", "Passenger Cars & Tractors", "INE101A01026", 3420, 425000, 29.0, 5.7, 0.7, 5, 1.10, sensex=True),
    U("HEROMOTOCO", "Hero MotoCorp Ltd", "Auto", "2/3 Wheelers", "INE158A01026", 5150, 103000, 23.0, 5.3, 3.2, 2, 0.85),
    U("EICHERMOT", "Eicher Motors Ltd", "Auto", "2/3 Wheelers", "INE066A01021", 6650, 182000, 38.0, 8.8, 1.1, 1, 0.90),
    # Pharma
    U("SUNPHARMA", "Sun Pharmaceutical Industries Ltd", "Pharma", "Pharmaceuticals", "INE044A01036", 1710, 410000, 37.0, 5.8, 0.8, 1, 0.60, sensex=True),
    U("CIPLA", "Cipla Ltd", "Pharma", "Pharmaceuticals", "INE059A01026", 1520, 123000, 24.0, 4.0, 0.9, 2, 0.55),
    U("DRREDDY", "Dr. Reddy's Laboratories Ltd", "Pharma", "Pharmaceuticals", "INE089A01031", 1260, 105000, 19.0, 3.5, 0.6, 1, 0.55),
    U("LUPIN", "Lupin Ltd", "Pharma", "Pharmaceuticals", "INE326A01037", 2010, 92000, 30.0, 5.4, 0.4, 2, 0.70, midcap=True),
    # Metals
    U("TATASTEEL", "Tata Steel Ltd", "Metals", "Iron & Steel", "INE081A01020", 162, 202000, 45.0, 2.2, 2.2, 1, 1.45, sensex=True),
    U("JSWSTEEL", "JSW Steel Ltd", "Metals", "Iron & Steel", "INE019A01038", 1110, 271000, 50.0, 3.4, 0.7, 1, 1.30),
    U("HINDALCO", "Hindalco Industries Ltd", "Metals", "Aluminium", "INE038A01020", 760, 171000, 11.0, 1.5, 0.5, 1, 1.40),
    # Telecom
    U("BHARTIARTL", "Bharti Airtel Ltd", "Telecom", "Telecom Services", "INE397D01024", 1960, 1170000, 37.0, 9.8, 0.4, 5, 0.70, sensex=True),
    # Financial Services
    U("BAJFINANCE", "Bajaj Finance Ltd", "Financial Services", "NBFC", "INE296A01024", 960, 595000, 34.0, 6.1, 0.4, 1, 1.25, sensex=True),
    U("BAJAJFINSV", "Bajaj Finserv Ltd", "Financial Services", "Holding Company", "INE918I01026", 1990, 318000, 33.0, 4.2, 0.1, 1, 1.10, sensex=True),
    # Infrastructure / Realty
    U("LT", "Larsen & Toubro Ltd", "Infrastructure", "Civil Construction", "INE018A01030", 3710, 510000, 33.0, 5.3, 0.9, 2, 1.10, sensex=True),
    U("ADANIPORTS", "Adani Ports and Special Economic Zone Ltd", "Infrastructure", "Port & Port Services", "INE742F01042", 1410, 304000, 27.0, 4.9, 0.5, 2, 1.35, sensex=True),
    U("DLF", "DLF Ltd", "Infrastructure", "Residential & Commercial Real Estate", "INE271C01023", 790, 195000, 45.0, 4.6, 0.6, 2, 1.50, midcap=True),
    # Consumer
    U("TITAN", "Titan Company Ltd", "Consumer", "Gems, Jewellery & Watches", "INE280A01028", 3530, 313000, 85.0, 26.0, 0.3, 1, 0.85, sensex=True),
    U("ASIANPAINT", "Asian Paints Ltd", "Consumer", "Paints", "INE021A01026", 2410, 231000, 57.0, 12.0, 1.0, 1, 0.70, sensex=True),
    U("TRENT", "Trent Ltd", "Consumer", "Speciality Retail", "INE849A01020", 4950, 176000, 105.0, 30.0, 0.1, 1, 1.20),
    # Cement
    U("ULTRACEMCO", "UltraTech Cement Ltd", "Cement", "Cement & Cement Products", "INE481G01011", 12100, 356000, 52.0, 5.2, 0.6, 10, 0.85, sensex=True),
    U("GRASIM", "Grasim Industries Ltd", "Cement", "Cement & Cement Products", "INE047A01021", 2720, 185000, 42.0, 2.0, 0.4, 2, 0.95),
    U("SHREECEM", "Shree Cement Ltd", "Cement", "Cement & Cement Products", "INE070A01015", 29200, 105000, 58.0, 4.9, 0.4, 10, 0.80),
]


@dataclass(frozen=True)
class IndexDef:
    symbol: str
    name: str
    target_level: float  # simulated last close is rebased to this level
    members: str  # 'all' | 'sensex' | 'sector:<name>' | 'midcap'


INDICES: list[IndexDef] = [
    IndexDef("NIFTY50", "NIFTY 50 (simulated aggregate)", 24350.0, "all"),
    IndexDef("SENSEX", "S&P BSE SENSEX (simulated aggregate)", 79800.0, "sensex"),
    IndexDef("NIFTYBANK", "NIFTY Bank (simulated aggregate)", 51600.0, "sector:Banking"),
    IndexDef("NIFTYIT", "NIFTY IT (simulated aggregate)", 38200.0, "sector:IT"),
    IndexDef("NIFTYMIDCAP", "NIFTY Midcap (simulated aggregate)", 55400.0, "midcap"),
]


def index_members(defn: IndexDef, universe: list[UniverseStock] | None = None) -> list[UniverseStock]:
    uni = universe if universe is not None else UNIVERSE
    if defn.members == "all":
        return [s for s in uni if not s.midcap]
    if defn.members == "sensex":
        return [s for s in uni if s.sensex]
    if defn.members == "midcap":
        return [s for s in uni if s.midcap]
    if defn.members.startswith("sector:"):
        sector = defn.members.split(":", 1)[1]
        return [s for s in uni if s.sector == sector]
    return []


SECTORS = sorted({s.sector for s in UNIVERSE})
