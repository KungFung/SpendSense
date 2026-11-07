# Pact

**A promise from you, to you.**

GreatUniHack 2026 · NatWest challenge: *AI-Powered Financial Inclusion & Resilience*

> Pact lets your calm self set the rules that protect you on your worst day, and steps in before the damage is done.

---

## 1. Why Pact

### The problem
Some people lose control of spending at predictable moments: during a low or manic episode, with ADHD impulsivity, after a relapse, or at 2am on payday. Money problems and mental health problems feed each other (see the Money and Mental Health Policy Institute's research). In those moments a budgeting chatbot doesn't help.

### The gap at NatWest
| NatWest has | What it does | What's missing |
|---|---|---|
| Cora spending chat, voice Spending Insights (trial, Sep 2026) | Explains your **past** spending | Looks backwards only, and only talks |
| Fraud Triage Agent | Routes fraud concerns to the right team | Covers fraud by criminals, not your own worst moments |
| Gambling block | Blocks gambling payments; turning it off takes 48 hours | Only covers gambling, and it's a simple on/off switch |
| Round Ups, Savings Goals, credit score | Helps people save | Assumes you're already doing fine |
| Financial Health Check, Banking My Way | Human support for vulnerable customers | You have to ask for it |

Rival banks are the same: Starling (Spending Intelligence) and Monzo both have spending chat. **Every bank's AI now tells you what you spent. Pact stops the crisis before it happens.**

### The story
Psychiatrists use the term **"Ulysses contract"** for decisions someone makes while they're well, to protect themselves later. It comes from Ulysses having his crew tie him to the mast so he could hear the Sirens without steering onto the rocks.
**Opening line:** *"Ulysses tied himself to the mast. We built the mast."*

---

## 2. Features

### 2.1 Make your pact (setup, on a calm day)
- The user talks or types in their own words: *"When I'm low I buy stuff on Klarna at 2am and order takeaways I can't afford."*
- The AI turns that into **plain-English rule cards**:
  - 🌙 Hold purchases over £50 between midnight and 6am
  - 🛍️ Hold a 3rd buy-now-pay-later plan in the same week
  - 🍔 Nudge me after 3 takeaways in a week
  - 🏠 Never let my balance fall below £650 (rent money)
- **Nothing goes live until the user confirms each card.** The AI suggests rules; it never decides them.
- The user records a **15-second voice message to their future self**. **We use the real recording and never clone the user's voice with AI.**

### 2.2 Rules engine (the mast)
Plain code, not AI. At the moment of payment it decides one of: **allow · nudge · hold · notify**.

| Rule type | Example |
|---|---|
| Time window | Over £50 between 00:00 and 06:00 |
| Category | Buy now pay later, gambling, gaming and in-app purchases, crypto, cash withdrawals, takeaways |
| Burst of spending | More than 4 purchases in 2 hours |
| BNPL stacking | 3 or more active plans |
| Balance floor | Protect the rent money |
| New merchant | First purchase at a shop never used before, over £100 |
| **Big purchase** | Anything over the user's "big purchase" amount (default £150) that wasn't planned (see 2.3) |

| Action | What happens |
|---|---|
| Nudge | Shows the user's own message, then lets the payment through |
| Hold | Temporary cooling-off period (default 24h) |
| Notify | The trusted person gets a check-in signal |

### 2.3 Planned purchases: the cooling-off method ⭐ NEW
For big things the user genuinely wants (a TV, a laptop, a sofa). They don't want the purchase cancelled; they just want to be sure it isn't an impulse.

**How it works**
1. **Plan it in advance.** The user tells Pact: *"I want to buy a TV, about £450, from Currys."*
2. **The cooling-off period starts.** Its length depends on the price:

   | Price | Cooling-off period |
   |---|---|
   | Under £100 | 24 hours |
   | £100 – £499 | 48 hours |
   | £500 and over | 72 hours |

3. **Halfway check-in:** *"Still want the TV? No pressure either way."*
4. **Ready:** when the period ends, the purchase is **cleared**. A matching payment (same shop, amount within ±10%) **goes through without a hold**, even at 2am, for the next **7 days**. After that the plan expires and has to be made again.
5. **Changed your mind?** Cancel at any time. The amount is added to **"£ kept by changing your mind."**

**Rules**
- Unplanned big purchase → **held**, and Pact offers **"Plan it instead"**, which starts the cooling-off period from that moment.
- The user can **make a cooling-off period longer, never shorter** (the same "tighten instantly, loosen slowly" principle as everywhere else in Pact).
- Completing a planned purchase **never breaks the streak**. Planning ahead is exactly the behaviour we want to reward.
- **Essentials are never held** (groceries, pharmacy, transport, fuel, household bills), so a broken fridge or boiler isn't blocked. The emergency button still works.

### 2.4 The streak ⭐ NEW
Like a game or a recovery app: **how many days in a row you've stayed on track.**

**What "on track" means for a day**
- ✅ Spending stayed inside the pact (no rule was broken and no hold was overridden)
- ✅ Non-essential spending stayed within the user's daily allowance (optional, set during setup)
- ✅ Holds **don't** break the streak, because a hold means Pact did its job
- ✅ Planned purchases **don't** break the streak
- ❌ Using the emergency button on a non-essential purchase, or going over the daily allowance, ends the streak

**Designed to be kind, not harsh**
Strict streaks can backfire. Psychologists call this the **"abstinence violation effect"**: once a streak breaks, people think "I've blown it anyway" and binge. So:
- **One free "grace day" a week** protects the streak automatically, like Duolingo's streak freeze
- When a streak ends, lead with the positive: *"You were on track 26 of the last 30 days"* and *"Longest streak: 19 days"*, not a big zero
- **Milestone badges** at 3, 7, 14, 30, 60 and 100 days
- The user can choose to **share milestones with their trusted person**: *"Jordan just hit 30 days 🎉"* (milestones only, never spending)
- No leaderboards and no comparing yourself with other people

### 2.5 Drift detector (spotting a rough patch)
- Learns the user's **normal pattern** from about 12 months of transactions.
- Scores today against that normal using: spending speed, late-night activity, share of shops not used before, number of BNPL plans, cash withdrawals, and how close it is to payday.
- Output: **calm · unsettled · rough patch**, always with the **top 3 reasons** in plain English.
- **Rough patch mode** applies stricter rules automatically, **only if the user agreed to that during setup.**
- **Risk forecast ("financial time travel"):** a heatmap of the user's riskiest hours (e.g. *payday Fridays, 11pm–3am*) and a home-screen line: *"Tonight is a high-risk window."*

### 2.6 The hold (the moment that matters)
The screen dims:
> *Your Pact is holding £340 at Klarna × ASOS*
> 🔊 *(the user's own voice note plays)*
> *Rule: "Over £50 after midnight", which you set on 3 Oct*

Options: **⏳ Wait** (purchase saved, with a countdown) · **📅 Plan it instead** · **❌ Cancel** · **💬 Message Sam** · **🚨 This is an emergency** (released immediately and logged)

### 2.7 Trusted person
- Invited by SMS or WhatsApp.
- Sees **signals only**: *"Jordan might appreciate a check-in 💜"*, plus streak milestones if the user allows it. **Never amounts or shops.**
- The user chooses when they're told: never, only during a rough patch, or after every hold.

### 2.8 Morning after and monthly view
- *"Last night Pact held 1 purchase. Still want it?"*
- *"£610 protected this month · 🔥 12-day streak · £450 kept by changing your mind."*

### 2.9 Key principle: tighten instantly, loosen slowly
- **Tightening** a rule, or making a cooling-off period longer → takes effect **immediately**
- **Loosening or deleting** a rule → takes effect after **48 hours** (like the gambling block)

The user is always in control, just not on impulse.

---

## 3. Ethics and safety
| Principle | How Pact applies it |
|---|---|
| User autonomy | The user writes every rule; holds are temporary; there's an emergency override |
| No diagnosis | Pact never guesses at mental health conditions. Health information is "special category" data under UK GDPR, so it needs explicit consent and is kept to a minimum |
| Transparency | Every hold shows the rule that caused it and when the user set it |
| AI never makes the decision | The AI drafts rules and explains things. Plain code makes every hold decision |
| Privacy | The trusted person gets signals only, never transaction details |
| No shaming | Supportive wording, a streak with grace days, no zero-day guilt |
| Essentials always allowed | Groceries, pharmacy, transport, fuel and bills are never held |
| Pointers to real help | Samaritans 116 123 · National Gambling Helpline 0808 8020 133 · StepChange · Money and Mental Health Policy Institute |

---

## 4. Architecture

```
┌──────────────────────────┐       ┌───────────────────────────────┐
│  Phone app (Next.js)     │◄─────►│  Backend (FastAPI, Python)    │
│  styled like Cora        │       │  • Rules engine (plain code)  │
└──────────────────────────┘       │  • Planned purchases + cooling-off│
┌──────────────────────────┐       │  • Streak tracker             │
│  Trusted person view     │◄─────►│  • Drift detector             │
└──────────────────────────┘       │  • Hold manager               │
                                   │  • Database (SQLite/Supabase) │
                                   └──┬──────────┬──────────┬──────┘
                                      ▼          ▼          ▼
                          OpenAI (Reply keys)  Stripe Issuing   NatWest Bank of APIs
                          • speech-to-text     (test mode)      sandbox + synthetic
                          • rules → JSON       real-time card   12-month history
                          • explanations       approve/hold
```

### Data model (first draft)
```
User            { id, name, big_purchase_threshold, daily_allowance }
Rule            { id, plain_english, source_quote, conditions{}, action,
                  cooldown_hours, notify_trusted, confirmed_by_user, active_from }
PlannedPurchase { id, item, merchant, amount, created_at, ready_at,
                  expires_at, status: cooling|ready|bought|cancelled|expired }
Hold            { id, transaction_id, rule_id, release_at, status }
StreakDay       { date, status: on_track|grace|broken, reason }
TrustedContact  { name, phone, notify_level, share_milestones }
Transaction     { id, amount, merchant, category, timestamp, essential }
```

### Example rule produced by the AI
```json
{
  "id": "r_late_night",
  "plain_english": "Hold purchases over £50 between midnight and 6am",
  "source_quote": "I buy stuff on Klarna at 2am",
  "conditions": { "time_window": ["00:00", "06:00"], "amount_gt": 50 },
  "action": "hold",
  "cooldown_hours": 24,
  "notify_trusted": "rough_patch_only",
  "confirmed_by_user": true
}
```

### Planned purchase logic
```
cooldown_hours(price):  < £100 → 24 · £100–£499 → 48 · ≥ £500 → 72
on payment:
  if essential                                → allow
  if matches a READY planned purchase (±10%)  → allow (counts as on track)
  if amount ≥ big_purchase_threshold          → hold + offer "Plan it instead"
  else                                        → run the normal rules
```

### Notes
- **Stripe Issuing:** Stripe asks our server to approve or decline each card payment in real time (within about 2 seconds). A "hold" is a decline that Pact saves as a held purchase. Check in **hour 1** that Issuing can be turned on in test mode; if it can't, use a pretend payment endpoint that behaves the same way.
- **Data:** one main character (Jordan, 26) with 12 months of synthetic transactions, including late-night BNPL binges around payday. The NatWest sandbox shows the integration is real.

---

## 5. Screens
| # | Screen | Priority |
|---|---|---|
| 1 | Welcome and consent | Must |
| 2 | Make your pact (voice or chat) | Must |
| 3 | Confirm rule cards | Must |
| 4 | Record message to future self | Must |
| 5 | Add trusted person | Nice to have |
| 6 | Home: status, 🔥 streak, tonight's risk, £ protected | Must |
| 7 | **Hold screen** | Must, the most important screen |
| 8 | **Planned purchases (cooling-off)** | Must |
| 9 | Morning after | Must |
| 10 | Insights: heatmap, streak calendar, history with reasons | Nice to have |
| 11 | Edit pact (48-hour delay to loosen) | Nice to have |
| 12 | Trusted person view (on a 2nd phone) | Must |
| 13 | NatWest view: anonymised outcomes | Stretch goal |

---

## 6. 24-hour timeline
| Hours | Milestone |
|---|---|
| 0–1 | Collect OpenAI keys from the Reply desk · test Stripe Issuing · register for the NatWest sandbox · talk to the NatWest mentors |
| 1–4 | Synthetic Jordan data · rule format agreed · app skeleton · AI rule-writing prompt |
| 4–10 | Rules engine · hold manager · planned purchases · card approval connected · setup screens |
| 10–12 | 🎯 **The whole flow works once:** speak a rule → confirm → payment at 2am → hold → voice note plays |
| 12–18 | Streak · trusted person view · morning after · heatmap · 48-hour loosening delay · polish |
| 18–21 | **Stop adding features.** Fix bugs, final design pass, write the pitch |
| 21–23 | Rehearse 5+ times · record a backup demo video |
| 23–24 | Submit · rest · present |

## 7. Who does what
| Person | Owns |
|---|---|
| Backend | Rules engine, hold manager, planned purchases, streak logic, Stripe connection, database |
| AI and data | Synthetic data, drift detector, risk forecast, AI prompts |
| Frontend | All screens, hold screen, cooling-off screen, streak visuals, trusted person view |
| Pitch and product | Script, slides, ethics slide, practice Q&A, backup video, user testing |

---

## 8. Demo script (3 minutes)
1. **0:00** *"Ulysses tied himself to the mast. Today, there's no mast for your bank account."* Rival banks' AI tells you what you spent; nothing stops the damage before it happens.
2. **0:20** Jordan speaks their pact → rule cards appear → Jordan confirms → records the voice note.
3. **0:45** Home screen: 🔥 **11-day streak** · *"Tonight is a high-risk window: payday Friday."*
4. **1:00** **1:47am.** A real test card payment of £340 through Stripe → **held** → Jordan's own voice plays. Jordan taps "Message Sam", and Sam's phone buzzes on stage.
5. **1:35** **The TV.** Jordan actually wants a £450 TV, so they **plan it**: a 48-hour cooling-off period starts (sped up for the demo). Halfway: *"Still want it?"* Yes → ready → the payment goes through at 2am with no hold. 🔥 The streak moves to 12.
6. **2:10** Morning after: *"£610 protected · 12-day streak · Sam saw only a check-in."*
7. **2:25** Trust and fit: plain code decides, AI only writes and explains, essentials are never held, loosening takes 48 hours, and it builds on NatWest's existing card controls.
8. **2:45** *"A promise from you, to you. Pact."*

## 9. Questions judges will ask, with answers
| Question | Answer |
|---|---|
| Can't they just turn it off? | Loosening takes 48 hours, like the gambling block. They're free to leave, just not on impulse |
| Isn't this controlling people? | The user writes every rule. Pact only enforces the user's own decisions |
| What if I genuinely need a big purchase? | Plan it. The cooling-off period proves it isn't an impulse, then it goes through without a hold |
| What about real emergencies? | Essentials are never held, and there's an emergency button that releases a payment immediately |
| Won't a broken streak make people feel worse? | Grace days, "26 of the last 30 days" wording, and no leaderboards |
| What if the AI gets it wrong? | The AI never decides. The user confirms the rules and plain code enforces them |
| How does NatWest benefit? | Fewer arrears, write-offs and complaints · evidence for the FCA's Consumer Duty · customers who stay longer |
| Why AI? | Turning people's own words into rules, learning each person's normal pattern, and forecasting risky times |
| Privacy and health data? | No guesses about health, minimal data, explicit consent, trusted person sees signals only |

## 10. Stretch goals
- 📅 Payday Clash: forecast the Universal Credit drop that happens when two paydays fall in the same assessment period
- 🌍 Setting up a pact in several languages
- 🏦 A NatWest outcomes dashboard
- 👵 Trusted Helper mode for carers of elderly parents

## 11. First-hour checklist
- [ ] OpenAI keys from the Reply desk
- [ ] Stripe Issuing test mode works? (if not, use the pretend payment endpoint)
- [ ] NatWest Bank of APIs sandbox access
- [ ] Ask the NatWest mentors: do customers want more than the gambling block? A lightweight trusted contact?
- [ ] Agree the rule format (section 4)
