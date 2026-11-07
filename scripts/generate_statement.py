#!/usr/bin/env python3
"""Generate a convincing NatWest-style bank statement CSV for testing Pact.

The output has the same columns as statement_withinfo.csv, newest first:
    Date, Type, Description, Value, Balance, Flagged, Pre-approved

so it works with the spending chart ("Upload CSV", or replace statement_withinfo.csv)
and with scripts/anomaly_detection.py.

Examples:
    python3 scripts/generate_statement.py                              # 90 days, average person
    python3 scripts/generate_statement.py --days 180 --spender big --irresponsibility 0.8
    python3 scripts/generate_statement.py --spender frugal --irresponsibility 0 --seed 1 -o calm.csv
    python3 scripts/generate_statement.py --days 30 -o -                # print to the terminal

Only uses the Python standard library.
"""

import argparse
import csv
import math
import random
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
SPENDER_PRESETS = {"frugal": 0.6, "average": 1.0, "big": 1.8}

# ---------------------------------------------------------------------------
# Everyday spending. Each category: visits per week, hours it happens in, and
# merchants as (statement name, lowest £, highest £). {city} is filled in.
# Essentials (groceries, transport) are never flagged, as in PROJECT.md.
# ---------------------------------------------------------------------------
CATEGORIES = {
    "groceries": dict(per_week=2.5, essential=True, hours=(8, 21), merchants=[
        ("TESCO STORES 3297", 9, 55), ("SAINSBURYS S/MKTS", 8, 50), ("ALDI {city}", 10, 45),
        ("LIDL GB {city}", 8, 40), ("CO-OP GROUP 070412", 3, 18)]),
    "transport": dict(per_week=4, essential=True, hours=(7, 19), merchants=[  # repeats = more likely
        ("FIRST BUS {city}", 2.2, 5), ("FIRST BUS {city}", 2.2, 5), ("METROLINK", 1.8, 5.6), ("METROLINK", 1.8, 5.6),
        ("NORTHERN TRAINS", 4, 28), ("UBER *TRIP", 6, 22)]),
    "coffee": dict(per_week=3, hours=(7, 11), merchants=[
        ("COSTA COFFEE 43021", 2.8, 5.5), ("STARBUCKS {city}", 3.2, 6.5), ("CAFFE NERO", 2.9, 5.8), ("PRET A MANGER", 3, 7)]),
    "lunch": dict(per_week=2.5, hours=(11, 14), merchants=[
        ("GREGGS PLC", 2.5, 8), ("PRET A MANGER", 4, 12), ("TESCO EXPRESS", 3, 9), ("LEON {city}", 7, 13)]),
    "eating_out": dict(per_week=0.8, hours=(18, 22), merchants=[
        ("NANDOS {city}", 12, 38), ("WAGAMAMA", 14, 35), ("WETHERSPOONS 4412", 6, 30), ("FIVE GUYS", 11, 22)]),
    "takeaway": dict(per_week=0.8, hours=(18, 23), merchants=[
        ("DELIVEROO", 14, 35), ("UBER *EATS", 13, 33), ("JUST EAT.CO.UK LTD", 12, 30)]),
    "shopping": dict(per_week=1.2, hours=(10, 21), merchants=[
        ("AMAZON.CO.UK*2K4P1", 6, 60), ("PRIMARK {city}", 8, 45), ("H&M {city}", 10, 55), ("ASOS.COM", 15, 80),
        ("BOOTS 1043", 4, 30), ("ARGOS LTD", 10, 60), ("TK MAXX 0221", 8, 45)]),
    "entertainment": dict(per_week=0.4, hours=(14, 22), merchants=[
        ("ODEON CINEMAS", 8, 22), ("VUE {city}", 8, 20), ("WATERSTONES", 8, 25)]),
}

# Spending that only irresponsible people do (all flagged by Pact's category rule).
GAMING = [("STEAM PURCHASE", 5, 60), ("PLAYSTATION NETWORK", 6, 70), ("MICROSOFT*XBOX", 5, 60)]
GAMBLING = [("BET365", 10, 100), ("PADDY POWER", 10, 80), ("SKY BETTING", 5, 60)]
BNPL = [("CLEARPAY*ASOS", 40, 150), ("KLARNA*ZARA", 45, 160), ("KLARNA*JD SPORTS", 50, 180)]
CRYPTO = [("COINBASE UK", 25, 200)]
SPLURGE = [("SELFRIDGES {city}", 80, 320), ("APPLE STORE", 90, 400), ("JD SPORTS", 60, 180), ("ZARA {city}", 50, 200)]
# Online shops, for late-night sprees (physical shops are shut at 2am).
ONLINE = [("AMAZON.CO.UK*2K4P1", 8, 70), ("AMZNMKTPLACE", 6, 50), ("ASOS.COM", 15, 90), ("SHEIN.COM", 8, 45)]
# Big things a responsible person plans ahead (pre-approved in Pact).
PLANNED = [("CURRYS", 120, 480), ("IKEA {city}", 80, 350), ("JOHN LEWIS", 100, 400), ("HALFORDS", 90, 300)]

# Direct debits: (name, day of month, lowest £, highest £). Fixed amounts have lo == hi.
DIRECT_DEBITS = [
    ("OCTOPUS ENERGY", 1, 55, 95), ("{city} CITY COUNCIL", 1, 112, 112), ("EE LIMITED", 14, 22, 22),
    ("VIRGIN MEDIA", 18, 32, 32), ("SPOTIFY UK", 3, 11.99, 11.99), ("NETFLIX.COM", 9, 10.99, 10.99),
    ("PUREGYM LTD", 5, 24.99, 24.99),
]
FRIENDS = ["T BROWN", "A PATEL", "M WILSON", "S CAMPBELL", "J OKAFOR", "L NGUYEN"]


@dataclass
class Txn:
    when: datetime
    type: str
    description: str
    value: float  # negative = money out
    category: str = ""
    essential: bool = False
    pre_approved: bool = False
    flagged: bool = False
    balance: float = 0.0  # running balance, filled in by finalise
    tipped_overdrawn: bool = False


class Generator:
    def __init__(self, args):
        self.a = args
        self.r = random.Random(args.seed)
        self.end = args.end_date
        self.start = self.end - timedelta(days=args.days - 1)
        self.txns: list[Txn] = []
        self.card = self.r.randint(1000, 9999)  # last 4 digits of the debit card

    # ---- helpers ----
    def name(self, template):
        return template.replace("{city}", self.a.city.upper())

    def amount(self, lo, hi, scale=1.0):
        # Skewed towards the low end, like real spending. Fixed amounts stay fixed.
        if lo == hi:
            return round(lo, 2)
        return round((lo + (hi - lo) * self.r.random() ** 1.6) * scale, 2)

    def at(self, day, hour_from, hour_to):
        hour = self.r.uniform(hour_from, hour_to)
        return datetime.combine(day, datetime.min.time()) + timedelta(hours=hour)

    def in_range(self, when):
        return self.start <= when.date() <= self.end

    def add(self, txn):
        if self.in_range(txn.when):
            self.txns.append(txn)

    def card_payment(self, when, merchant, amount, category="", essential=False, pre_approved=False):
        # NatWest card payments look like: '3167 03Nov26 C , DELIVEROO , GB
        d = f"{when.day:02d}{MONTHS[when.month - 1]}{when.year % 100:02d}"
        self.add(Txn(when, "POS", f"{self.card} {d} C , {self.name(merchant)} , GB", -amount, category, essential, pre_approved))

    def everyday(self, category, day, scale=1.0, hours=None):
        c = CATEGORIES[category]
        merchant, lo, hi = self.r.choice(c["merchants"])
        when = self.at(day, *(hours or c["hours"]))
        self.card_payment(when, merchant, self.amount(lo, hi, scale), category, c.get("essential", False))

    def payday(self, year, month):
        # Paid on the --payday of each month, or the Friday before if that's a weekend.
        last_day = (date(year + month // 12, month % 12 + 1, 1) - timedelta(days=1)).day
        d = date(year, month, min(self.a.payday, last_day))
        while d.weekday() >= 5:
            d -= timedelta(days=1)
        return d

    def months(self):
        y, m = self.start.year, self.start.month
        while date(y, m, 1) <= self.end:
            yield y, m
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)

    # ---- the statement ----
    def generate(self):
        a, r = self.a, self.r
        spend = a.spending
        irr = a.irresponsibility
        paydays = {self.payday(y, m) for y, m in self.months()}
        paydays |= {self.payday(*(y - 1, 12) if m == 1 else (y, m - 1)) for y, m in self.months()}

        # Regular money in and out
        for y, m in self.months():
            self.add(Txn(datetime(y, m, 1, 5, 30), "S/O", f"{a.landlord} RENT", -a.rent, "rent", True, True))
            for nm, dom, lo, hi in DIRECT_DEBITS:
                self.add(Txn(datetime(y, m, dom, 6, 0), "D/D", self.name(nm), -self.amount(lo, hi), "bill", True, True))
            pd = self.payday(y, m)
            self.add(Txn(datetime.combine(pd, datetime.min.time()) + timedelta(hours=4, minutes=15), "BAC",
                         f"{a.employer} SALARY", round(a.salary, 2), "income"))
            # Responsible people plan big purchases ahead; Pact lets these through.
            if r.random() < (1 - irr) * 0.5:
                d = date(y, m, r.randint(1, 28))
                merchant, lo, hi = r.choice(PLANNED)
                self.card_payment(self.at(d, 10, 19), merchant, self.amount(lo, hi, spend), "planned", pre_approved=True)

        day = self.start
        while day <= self.end:
            weekend = day.weekday() >= 5
            days_since_pay = min(((day - p).days for p in paydays if p <= day), default=99)
            flush = days_since_pay <= 3  # just been paid

            # Everyday spending: how often scales gently with --spending, takeaways with irresponsibility
            for category, c in CATEGORIES.items():
                rate = c["per_week"] / 7 * math.sqrt(spend)
                if category == "takeaway":
                    rate *= 1 + 2.5 * irr
                if category in ("eating_out", "entertainment", "shopping") and weekend:
                    rate *= 1.8
                if category in ("coffee", "lunch") and weekend:
                    rate *= 0.4
                if flush and not c.get("essential"):
                    rate *= 1 + irr
                for _ in range(self.poisson(rate)):
                    self.everyday(category, day, spend)

            # Friends: splitting bills (money out) and paying back (money in)
            if r.random() < 0.06:
                who = r.choice(FRIENDS)
                what = r.choice(["DINNER", "TICKETS", "BILLS", "TAXI"])
                self.add(Txn(self.at(day, 12, 22), "DPC", f"{who} , {what} , VIA MOBILE - PYMT",
                             -self.amount(5, 40, spend), "friends"))
            if r.random() < 0.05:
                when = self.at(day, 9, 21)
                ref = f"FP {when:%d/%m/%y} {when:%H%M} , {r.randint(10**8, 10**9 - 1)}"
                self.add(Txn(when, "BAC", f"{r.choice(FRIENDS)} , {ref}", self.amount(5, 60), "income"))

            # Bad days: more likely on Fridays/Saturdays and just after payday
            p = irr * 0.11 * (1.8 if day.weekday() in (4, 5) else 1) * (2 if flush else 1)
            if r.random() < p:
                self.episode(day, spend, irr, flush)
            day += timedelta(days=1)

        self.txns.sort(key=lambda t: t.when)
        return self.txns

    def poisson(self, lam):
        # Knuth's method; fine for the small rates used here
        L, k, p = math.exp(-lam), 0, 1.0
        while True:
            p *= self.r.random()
            if p <= L:
                return k
            k += 1

    def episode(self, day, spend, irr, flush):
        r = self.r
        kinds = ["late_night_shopping", "takeaway_run", "night_out", "gaming"]
        if irr > 0.4:
            kinds += ["gambling", "bnpl"]
        if irr > 0.7:
            kinds += ["gambling", "crypto"]
        if flush:
            kinds += ["payday_splurge", "payday_splurge"]
        kind = r.choice(kinds)

        if kind == "late_night_shopping":  # several online orders around midnight
            for _ in range(r.randint(2, 5)):
                merchant, lo, hi = r.choice(ONLINE + GAMING + BNPL[:1])
                self.card_payment(self.at(day, 22.5, 27), merchant, self.amount(lo, hi, spend * 1.4), "impulse")
        elif kind == "takeaway_run":  # takeaway several nights in a row
            for i in range(r.randint(3, 5)):
                self.everyday("takeaway", day + timedelta(days=i), spend, hours=(19, 23.5))
        elif kind == "night_out":  # bar, cash machine, more bars, taxi home
            self.everyday("eating_out", day, spend * 1.3, hours=(20, 22))
            when = self.at(day, 22, 25)
            self.add(Txn(when, "C/L", f"LNK {self.a.city.upper()} {when.day:02d}{MONTHS[when.month - 1]} @{when:%H:%M}",
                         -float(r.choice([20, 30, 40, 50])), "cash"))
            for _ in range(r.randint(2, 4)):
                self.card_payment(self.at(day, 22, 26), r.choice(["WETHERSPOONS 4412", "REVOLUTION BAR", "THE ALBERT"]),
                                  self.amount(5, 25, spend), "nightlife")
            self.card_payment(self.at(day, 26, 27.5), "UBER *TRIP", self.amount(10, 30), "transport")
        elif kind == "gaming":
            for _ in range(r.randint(1, 3)):
                merchant, lo, hi = r.choice(GAMING)
                self.card_payment(self.at(day, 19, 26), merchant, self.amount(lo, hi, spend), "gaming")
        elif kind == "gambling":  # chasing losses: several bets in one evening
            merchant, lo, hi = r.choice(GAMBLING)
            for _ in range(r.randint(2, 5)):
                self.card_payment(self.at(day, 20, 26), merchant, self.amount(lo, hi, spend), "gambling")
        elif kind == "bnpl":
            merchant, lo, hi = r.choice(BNPL)
            self.card_payment(self.at(day, 12, 25), merchant, self.amount(lo, hi, spend), "bnpl")
        elif kind == "crypto":
            merchant, lo, hi = r.choice(CRYPTO)
            self.card_payment(self.at(day, 21, 27), merchant, self.amount(lo, hi, spend), "crypto")
        elif kind == "payday_splurge":  # big unplanned buys right after payday
            for _ in range(r.randint(1, 3)):
                merchant, lo, hi = r.choice(SPLURGE)
                self.card_payment(self.at(day, 11, 22), merchant, self.amount(lo, hi, spend), "splurge")


# ---------------------------------------------------------------------------
# Balances, declined payments and flags, worked out in date order.
# Flags follow the Pact rules in PROJECT.md (section 2.2). Bills, planned
# purchases and essentials are never flagged.
# ---------------------------------------------------------------------------
FLAG_CATEGORIES = {"gaming", "gambling", "bnpl", "crypto", "cash"}


def finalise(txns, start_balance, overdraft_limit, big_purchase=150):
    """Fills in balances and flags. Card payments, cash withdrawals and transfers that would go past
    the overdraft limit are declined, so they don't appear (bills still go out). Returns what's left."""
    balance = start_balance
    kept = []
    for t in txns:
        if t.value < 0 and t.type in ("POS", "C/L", "DPC") and balance + t.value < -overdraft_limit:
            continue  # declined
        before, balance = balance, round(balance + t.value, 2)
        t.balance = balance
        t.tipped_overdrawn = before >= 0 > balance
        kept.append(t)

    seen_merchants = set()
    spending = [t for t in kept if t.value < 0]
    for t in kept:
        if t.value >= 0 or t.pre_approved:
            continue
        merchant = t.description.split(" , ")[1] if t.type == "POS" else t.description
        new_merchant = merchant not in seen_merchants
        seen_merchants.add(merchant)
        if t.essential:
            continue
        amount = -t.value
        recent_takeaways = sum(1 for x in spending if x.category == "takeaway"
                               and timedelta(0) <= t.when - x.when <= timedelta(days=7))
        burst = sum(1 for x in spending if x.type in ("POS", "DPC")
                    and timedelta(0) <= t.when - x.when <= timedelta(hours=2))
        t.flagged = (
            t.category in FLAG_CATEGORIES                                  # risky category
            or (t.category == "takeaway" and recent_takeaways >= 3)        # 3rd+ takeaway in a week
            or (t.when.hour < 6 and amount > 50)                           # over £50 between 00:00 and 06:00
            or burst > 4                                                   # more than 4 purchases in 2 hours
            or (new_merchant and amount > 100)                             # first time at a shop, over £100
            or amount > big_purchase                                       # unplanned big purchase
            or t.tipped_overdrawn                                          # pushed the account into overdraft
            or (t.balance < 0 and amount > 30)                             # bigger spending while overdrawn
        )
    return kept


def write_csv(txns, out):
    w = csv.writer(out)
    w.writerow(["Date", "Type", "Description", "Value", "Balance", "Flagged", "Pre-approved"])
    for t in reversed(txns):  # NatWest exports are newest first
        when = f"{t.when.day:02d} {MONTHS[t.when.month - 1]} {t.when.year} {t.when:%H:%M}"
        w.writerow([when, t.type, "'" + t.description, f"{t.value:.2f}", f"{t.balance:.2f}",
                    "Yes" if t.flagged else "No", "Yes" if t.pre_approved else "No"])


def spender(value):
    if value in SPENDER_PRESETS:
        return SPENDER_PRESETS[value]
    try:
        n = float(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"use {', '.join(SPENDER_PRESETS)} or a number like 1.5")
    if n <= 0:
        raise argparse.ArgumentTypeError("must be more than 0")
    return n


def zero_to_one(value):
    n = float(value)
    if not 0 <= n <= 1:
        raise argparse.ArgumentTypeError("must be between 0 and 1")
    return n


def main():
    p = argparse.ArgumentParser(description="Generate a convincing NatWest-style statement CSV for testing Pact.",
                                formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    p.add_argument("--days", type=int, default=90, help="how many days of statement")
    p.add_argument("--end-date", type=date.fromisoformat, default=date.today(), help="last day, YYYY-MM-DD")
    p.add_argument("--spender", dest="spending", type=spender, default=1.0,
                   help="how big a spender: frugal, average, big, or a multiplier like 1.5")
    p.add_argument("--irresponsibility", type=zero_to_one, default=0.3,
                   help="0 = careful, 1 = very impulsive (late nights, takeaways, gambling, payday splurges)")
    p.add_argument("--salary", type=float,
                   help="monthly take-home pay in £ (default: enough for a careful person at this spending level "
                        "to save a little: rent + £350 + £900 x spender^1.5)")
    p.add_argument("--payday", type=int, default=28, help="day of the month salary arrives")
    p.add_argument("--rent", type=float, default=650.0, help="monthly rent in £ (standing order on the 1st)")
    p.add_argument("--start-balance", type=float, default=1200.0, help="balance before the first transaction")
    p.add_argument("--overdraft-limit", type=float, default=1000.0,
                   help="arranged overdraft in £; card payments past it are declined and left out")
    p.add_argument("--city", default="Manchester", help="used in shop names")
    p.add_argument("--employer", default="ACME LTD", help="name on the salary payment")
    p.add_argument("--landlord", default="J SMITH", help="name on the rent standing order")
    p.add_argument("--seed", type=int, help="random seed, for the same statement every time")
    p.add_argument("-o", "--output", default="generated_statement.csv", help="output file, or - for the terminal")
    a = p.parse_args()
    if a.days < 1:
        p.error("--days must be at least 1")
    if not 1 <= a.payday <= 31:
        p.error("--payday must be a day of the month (1-31)")
    if a.salary is None:
        # Bills don't grow with lifestyle, everyday spending does (amounts x s, how often x sqrt(s)).
        a.salary = round(a.rent + 350 + 900 * a.spending ** 1.5, 2)

    generated = Generator(a).generate()
    txns = finalise(generated, a.start_balance, a.overdraft_limit)
    declined = len(generated) - len(txns)

    if a.output == "-":
        write_csv(txns, sys.stdout)
    else:
        with open(a.output, "w", newline="") as f:
            write_csv(txns, f)

    out = [t for t in txns if t.value < 0]
    print(f"{len(txns)} transactions over {a.days} days ({txns[0].when:%d %b %Y} to {txns[-1].when:%d %b %Y})"
          if txns else "No transactions", file=sys.stderr)
    print(f"Spent £{-sum(t.value for t in out):,.2f}, received £{sum(t.value for t in txns if t.value > 0):,.2f}, "
          f"closing balance £{txns[-1].balance:,.2f}" if txns else "", file=sys.stderr)
    print(f"{sum(t.flagged for t in out)} flagged, {sum(t.pre_approved for t in out)} pre-approved"
          + (f", {declined} declined (over the overdraft limit)" if declined else "")
          + ("" if a.output == "-" else f". Written to {a.output}"), file=sys.stderr)


if __name__ == "__main__":
    main()
