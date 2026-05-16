# Groundwork PM — Homepage Copy (Picked)

This is the curated version of `homepage-copy.md` with one variant chosen per section. All variants have been removed except the picks. Hand this directly to Prompt B.

**House tone**: Consultative/calm as the default, with the hero and a few key sections leaning into bold/contrarian energy to hit the "this thing actually automates" hook the audience research identified as the #1 missing element. Direct/punchy is used where specificity matters most (the inbox mock, the Excel comparison).

**Reading order matches the locked section order.**

---

## 1. Hero — variant (c) Capability-led, *bold/contrarian*

**Why this**: The single most important job of the hero is answering the prospect's unspoken question "is this actually automated, or is it another dashboard I have to update?" Variant (c) is the only hero that answers that question in the headline itself.

| Field | Copy |
|---|---|
| Headline | The property platform that updates itself. |
| Subhead | Mark an invoice paid and the owner statement is current. Assign a vendor and the case advances itself. No manual refresh. |
| Primary CTA | Automate my portfolio |
| Secondary CTA | Open the demo |
| Microcopy | Built for agencies managing more than 5 properties for more than one owner. |

---

## 2. Trust strip — locked headline + caption variant (b) *calm*

**Locked headline**:
> Built for modern property operations teams across emerging and established markets.

**Markets row (locked)**:
> Middle East · South Africa · USA · Kenya · UK

**Logo slots**: 4–6 placeholder circles below the markets row.

**Caption beneath the logos — variant (b) calm**:
> Used by agencies with one shared standard: every owner gets a current statement, every month.

**Why (b) over the others**: (a) "five continents" overclaims at launch. (c) "outgrown a shared Google Sheet" is funny but slightly mocks the visitor's current tooling — wrong placement this early in the page. (b) frames the value as a quiet professional standard, which matches the audience.

---

## 3. The Shift — variant (a) *direct/punchy*

**Why this**: The shift section is where the visitor needs to feel "yes, that's me." (a) names the universal experience most explicitly ("rent goes uncollected for a week before anyone notices"). (c) is too aggressive too early. (b) is good but slightly defensive ("without making you a spreadsheet refugee" softens the punch).

**Visual brief**: Left side — messy cluster of WhatsApp chat bubbles, Excel cells, sticky notes, email avatars overlapping. Right side — a single clean Operational Inbox screenshot with three rows. Connecting arrow labelled "Same data. One surface."

**Copy**:
> ### Stop coordinating across WhatsApp, email, and three spreadsheets.
>
> Every agency starts this way. By the fifth property it stops working. Rent goes uncollected for a week before anyone notices. Owners chase you for statements you already sent. A repair quote sits in your phone for ten days because nobody pinged you again.
>
> One inbox. One timeline per issue. The reminders chase themselves.

---

## 4. What changes when you switch — MIXED PICKS per the doc's own recommendation

**Why mixed**: The doc itself suggests combining variants. The four cards each cover a distinct automation, so the strongest version of each card wins regardless of voice. Voice consistency is preserved by tightening the picked cards lightly in Prompt B implementation.

**Visual**: 4 cards in a 2×2 grid on desktop, single column on mobile. Each with a small icon, bold one-line headline → 2-sentence body → tiny proof line in mono font.

**CTA below the grid**: "See it in the demo →"

### Card 1 — from variant (c) *bold/contrarian*

**Stop reconciling. The platform already did it.**
The link between a paid invoice and a posted income entry is enforced at the database level, not as a "best effort" sync. There is no scenario where the books and the statement disagree.
*Owner statements are always up to date. No manual refresh needed.*

### Card 2 — from variant (a) *direct/punchy*

**Owners approve repairs from their email, not your phone.**
Send a magic-link approval request; the owner clicks Approve or Reject from email; the case advances stages on its own. The waiting clock pauses while it's with them.
*Replaces: WhatsApp screenshots and three days of follow-up.*

### Card 3 — from variant (b) *consultative/calm*

**Expiries surface themselves before they become problems.**
Daily checks for lease ends, insurance renewals, and compliance certificates. The same items appear in your inbox until they're resolved, and the cron de-duplicates so you only get one email per threshold.
*Two warning levels: 30 days out, then 7 days out.*

### Card 4 — from variant (a) *direct/punchy*

**Cases that go quiet come back to the top.**
Every workflow stage has an SLA budget. If a case stalls past it, the system surfaces it in your inbox automatically — and pauses the clock when you're waiting on a vendor or owner.
*Replaces: the weekly "what was I doing about that?" review.*

---

## 5. A day in your inbox — variant (a) *direct/punchy*, with the vacant-unit row 3

**Why (a)**: The inbox mock must be vivid and specific. Variant (a) is the most concrete ("Rent overdue · Unit 4B · Sarah Chen") and uses the strongest action verbs ("Send formal notice"). (b) is calmer but loses urgency. (c) leads with the "11 things handled" line which is great but better as the footer (which all three variants use).

**Why vacant-unit for row 3**: Direct revenue-loss mapping. The doc's own recommendation, and correct.

**Visual brief**: Faithful mock of the real `/inbox` UI. Header reads **"Today: 3 things need you."** Three rows below, each with severity dot (red / amber / blue), title, subtitle, small chip "Triggered by: …", and a single primary action button on the right.

**Inbox header**: Today: 3 things need you.

### Row 1 — URGENT — Rent overdue · Unit 4B · Sarah Chen

| Field | Copy |
|---|---|
| Trigger | Invoice for March is 9 days past due |
| System already did | Logged the overdue status on day 1. Sent a reminder email at 07:00 UTC yesterday. Surfaced this in your inbox at URGENT severity because dunning crossed the 7-day threshold. |
| Action button | Send formal notice |

### Row 2 — WARNING — Approval waiting on owner · Water heater repair · $1,200

| Field | Copy |
|---|---|
| Trigger | Magic-link sent 3 days ago, owner has not responded |
| System already did | Set the case to "waiting on owner" — the SLA clock is paused so this isn't counted against your response time. Logged the email in the case timeline. |
| Action button | Resend approval link |

### Row 3 — Suggested — Unit 2A vacant for 32 days

| Field | Copy |
|---|---|
| Trigger | Daily check spotted a unit vacant > 30 days |
| System already did | Pre-filled the action: change unit status to "Listed" with one click. No data entry needed. |
| Action button | Mark as listed |

**Footer line**: + 11 other items handled automatically yesterday. (Rent reminders sent, owner statements refreshed, case stages advanced.)

**CTA below the mock**: "Open the live demo inbox →" — links to `/signup?demo=al-seef`.

---

## 6. How it works in your week — variant (b) *consultative/calm*

**Why (b)**: This section's job is to make the operator feel calm about their week, not pumped up. (b) achieves that ("You handle three things before your first coffee" / "Statements are sent, not drafted") without sliding into the slight smugness of (c). The audience is professionals — calm authority lands better than punchline energy.

**Visual**: Three horizontal panels (or vertical stack on mobile). Each with a small day-of-week indicator above it.

### Monday — A short list, not a deluge.
The cron ran at 07:00 and filed everything into your inbox by severity. Last week's loose ends carry over with their stage SLAs visibly counting down. You handle three things before your first coffee.

### Tuesday through Thursday — Cases move themselves.
Most of the work is conversations with tenants and vendors. The system handles the bookkeeping: vendor invoice attached → expense entry pre-filled; approval granted → case advances; status flipped to Completed → owner statement reflects the cost.

### Friday — Statements are sent, not drafted.
There is no copy-paste step. Open the property report (PDF), check it looks right, forward it. The bank reconciliation step you used to do? It happened in the same transaction as the invoice flip.

---

## 7. Live dashboard preview — variant (b) *calm*

**Why (b)**: The dashboard preview's job is to make the platform feel real and credible, not clever. (b) tells the visitor exactly what they're looking at — a real demo seed with a real property name from a real market we support. That's far more compelling than (c)'s contrarian framing or (a)'s breathless live-cron callout. The specificity of "20 units, Bahrain" also reinforces the global-emerging-markets positioning without saying it.

**Visual**: Keep the existing dashboard mockup.

**Label**: Sample property — Al Seef Residences (20 units, Bahrain)

**Caption**: A real demo seed. Open it and click around. Every cron job, every case timeline, every owner statement is wired up.

**CTA**: "Open the demo dashboard →" — direct link to the demo seed.

---

## 8. Why teams switch from spreadsheets — variant (a) *direct/punchy*

**Why (a)**: Comparison tables earn their keep through sharpness, not nuance. (a) has the cleanest contrasts ("Hope you remember" vs "Cron emails you" is brutal in the right way). (b) softens the Excel side to the point where the prospect's current pain isn't named. (c) is sharper still but the "07:00 UTC" technical specificity reads as bragging here — better placed in §4 cards.

**Visual**: Two-column table. Left column "Excel + WhatsApp + email" (muted gray). Right column "Groundwork PM" (gold/dark-navy). Headers fixed. Mobile: column-stacked rows.

| Task | Excel + WhatsApp + email | Groundwork PM |
|---|---|---|
| Marking a rent payment received | Update spreadsheet, email owner | One click. Owner statement updates itself. |
| Lease expiring in 30 days | Hope you remember | Cron emails you. Inbox surfaces it. |
| Owner approval for a $1,200 repair | WhatsApp message, screenshot of quote, three back-and-forths | One magic link. Owner clicks Approve. Logged on the case. |
| Vendor invoice for a completed job | Spreadsheet row, paper receipt, manual matching | Attachment on the case. Expense pre-filled. |
| End-of-month owner statement | Two hours of copy-paste | Already current. |
| Audit trail for a dispute | Search WhatsApp, hope screenshots saved | Per-case timeline of every email, comment, approval, status change. |

**CTA below the table**: Quiet "Start your 30-day trial →" link.

---

## 9. Pricing — framing line variant (a), feature list variant (b)

**Framing line — variant (a) *direct/punchy***:
> Compare to the cost of one missed lease renewal.

**Why (a)**: (c) "two years of the platform" risks sounding boastful at the wrong moment (right before asking for the credit card decision). (a) is sharp, defensible, and short.

**Why (b) for the feature list**: (a) is good but slightly terse for a pricing card where prospects are doing real evaluation. (c) is too contrarian for the moment of decision. (b) is the right balance — calm, complete, and full of nouns the prospect will scan for.

**Layout**: Keep the existing pricing cards. Add one bold framing line above the card grid.

**Feature list (apply to all three tiers, expanding upward per current Starter/Growth/Pro structure)**:
- Unlimited units per property
- Automatic rent posting + owner statement refresh
- Tenant portal (shareable, no login)
- Owner approvals via email magic link
- Daily cron for lease / insurance / compliance deadlines
- Inbox queue with one-click suggested actions
- 3 / 6 / 12 month cashflow forecast

(Keep the existing tier-progression logic. The bullets above are the Growth-tier feature set; Starter trims and Pro extends as currently structured. Do not change pricing numbers, tier names, or the monthly/annual toggle.)

---

## 10. Final CTA — variant (b) *consultative/calm*

**Why (b)**: (a) is fine but generic. (c) "Make Excel optional" is the sharpest line in the document but presumes the visitor has already conceded Excel is the problem — which works for some visitors and alienates others. (b) splits the difference: it says "try it on your real portfolio" (high commitment language) and reassures with "click around the demo first" (low commitment escape hatch). Best balance of confidence and respect.

> ### Try it on your real portfolio for a month.
> Import a property in under 10 minutes. Or click around the demo first. Either way, no card and no setup call required.
>
> **[Open my first property]**
>
> _Includes the cron, the inbox, the cases workspace, the owner portal — everything._

---

## 11. Footer tagline — variant (a) *direct*

**Why (a)**: (a) is the cleanest articulation of what the product actually is for the people who buy it. (b) is competent but generic. (c) "the part that updates itself" is the strongest line in the entire document but it lives in the hero — repeating it in the footer dilutes it. The footer should reinforce the category positioning ("operating system for property management teams"), not repeat the hero's hook.

**Tagline**:
> The operating system for modern property management teams.

---

# Voice check summary

Final tone distribution across the picked variants:

- **Hero**: bold/contrarian (the hook)
- **Trust strip**: calm
- **The Shift**: direct (naming the pain)
- **What Changes**: mixed (per spec — strongest version of each card)
- **Inbox mock**: direct (specificity matters most here)
- **Weekly Rhythm**: calm (operator-state-of-mind matters more than punch)
- **Dashboard preview**: calm
- **Excel comparison**: direct (sharpness wins)
- **Pricing**: direct framing line + calm feature list
- **Final CTA**: calm (respects the commitment moment)
- **Footer**: direct

The arc: bold opening → direct pain-naming → mixed mechanism cards → direct proof (inbox + table) → calm operating rhythm → calm decision moment → direct closing identity statement.

This gives the page a satisfying contour: it opens strong, gets specific in the middle where credibility lives, and ends calmly where it asks for the commitment.

---

# Implementation notes (preserved from the original framework — Prompt B uses these)

## Sections that need NEW components

| Section | Component | Notes |
|---|---|---|
| §3 The Shift visual | `src/components/landing/ShiftVisual.tsx` | Two-pane image: messy tools cluster left, clean inbox right. SVG + small images. Reuses LandingThemeProvider colours. |
| §4 What changes — 4-card grid | `src/components/landing/AutomationCards.tsx` | Same shape as existing `OutcomeCard` but with a small mono "Replaces:" / proof tagline at the bottom. Could extend `OutcomeCard` instead. |
| §5 Inbox mock | `src/components/landing/InboxMock.tsx` | Faithful mock of `/inbox`. Three hard-coded rows. Each row has: severity dot, title, subtitle, "Triggered by:" chip, "System already did:" expandable line, action button. Static — no data fetch. |
| §6 Weekly rhythm | `src/components/landing/WeeklyRhythm.tsx` | Three panels with day-of-week chips. Stacks vertically on mobile. |
| §8 Comparison table | `src/components/landing/ExcelVsTable.tsx` | 6-row two-column comparison. Sticky header on desktop. Stacks to row pairs on mobile. |
| §9 Pricing framing line | One-line element above the existing pricing grid | No new component — extend `PricingCard`'s wrapper. |

## Sections that REUSE existing components

| Section | Existing component |
|---|---|
| Page-level chrome | `LandingThemeProvider`, `LandingNav`, `BrandLogo` |
| §2 Trust strip | Existing `TrustBar` — replace copy, add markets row + logo slots |
| §7 Live dashboard preview | Existing `DashboardMockup` — only the label + caption change |
| §9 Pricing cards | Existing `PricingCard` — only the feature list strings change |
| §11 Footer | Existing footer in `RootPage` — only tagline string changes |

## Assets to supply

| Asset | Where | Notes |
|---|---|---|
| 4–6 customer / market logos | §2 Trust strip | Greyscale, equal-height. Replaceable placeholders OK at first. |
| Hero illustration or product screenshot | §1 Hero right column | Optional — current page is text-only above the dashboard mockup. Could be a small static InboxMock preview. |
| Messy-vs-clean visual | §3 The Shift | Probably commission. Could be a stylised SVG drawn from existing brand palette. |
| Updated dashboard screenshot | §7 Live dashboard preview | If the existing `DashboardMockup` looks stale — most likely OK as-is. |
| One real `/inbox` screenshot for §5 background | §5 | Optional — the InboxMock component can render the full thing in code. |

## Words this draft never uses (per spec)

leverage · seamless · unlock · revolutionary · next-generation · powerful · robust · cutting-edge · transform

## Words this draft never uses about us (per feature-inventory constraint)

SMS · WhatsApp integration · AI · machine learning · bank linking · open banking · DocuSign · credit check · screening · API · public REST · "smart" anything not rule-based
