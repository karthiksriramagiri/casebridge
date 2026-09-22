// Venu — the scenario library, generated from the Nuance Book.
//
// Source: lib/nuances.html (the same book served at /nuances). Regenerate with
// scripts/extract-nuances.py after the book changes — do not hand-edit.
//
// Each card is a complete call: `story` is the full fact pattern Venu plays,
// `nuance` is the one detail that decides the outcome (what the rep has to
// surface), and `reason` is the book's disposition rationale.

export type Disposition = 'qualified' | 'not_qualified' | 'escalate' | 'conditional' | 'screen'

export interface NuanceScenario {
  id: string
  num: string
  title: string
  category: string
  disposition: Disposition
  story: string
  nuance: string
  reason: string
}

export const NUANCE_SCENARIOS: NuanceScenario[] = [
  {
    "id": "n1-1",
    "num": "1.1",
    "title": "Clean Rear-End, All Checkpoints Clear",
    "category": "Rear-End Accidents",
    "disposition": "qualified",
    "story": "The caller is Maria Lopez, calling about her own accident — right person. The accident happened 9 days ago on a Tuesday evening. Maria was driving home from work and stopped at a red light on a four-lane road. She had been stopped for several seconds when she felt a hard impact from behind. The other driver, in a Toyota Camry, admitted fault on the spot — \"I didn't see you stop in time.\" A police officer responded, took both statements, and cited the other driver for following too closely. Maria has his insurance card — State Farm, confirmed active. She felt neck and lower back pain that evening, went to urgent care the next morning (cervical/lumbar strain), and has been to the chiropractor three times since, twice a week. Her rear bumper is caved in on the driver's side and the trunk no longer latches. Maria's own auto policy was active on the date of loss.",
    "nuance": "Every checkpoint lines up cleanly — but the rep should still walk through all eight rather than stopping early because \"rear-end + admitted fault\" sounds done. The detail that completes the file is confirming Maria's OWN policy was active on the DOL — the CA Prop 213 check, separate from the defendant having insurance.",
    "reason": "QUALIFIED. Maria is the plaintiff and not at fault (defendant admitted fault, cited by police). Defendant has active insurance to pursue, and Maria's own policy was active (Prop 213 satisfied). Injury and treatment within 30 days are confirmed (next-day urgent care, ongoing chiropractic). Property damage (caved bumper, broken trunk latch) supports the claim."
  },
  {
    "id": "n1-2",
    "num": "1.2",
    "title": "Rear Corner Clip, Mistaken for a Side-Swipe",
    "category": "Rear-End Accidents",
    "disposition": "qualified",
    "story": "The caller is Ben Okafor, the driver — right person. The accident happened 6 days ago around 5 PM. Ben was slowing down for traffic on a two-lane road when he felt an impact to the rear-left corner of his car. He says, \"It wasn't a straight hit — it caught the corner, like he swerved at the last second.\" The other driver, in the lane behind Ben, told him he'd tried to brake and swerve to avoid the collision but clipped the corner anyway. No police were called; insurance was exchanged — the other driver carries Liberty Mutual, confirmed active. Ben has neck stiffness and went to urgent care two days later, starting chiropractic care the following week, no gaps so far. His rear bumper has a crumpled left corner and the taillight housing is cracked. Ben's own policy is active.",
    "nuance": "\"Rear corner\" damage makes some reps think \"side-swipe\" or \"lane dispute\" and start asking for witnesses. The criteria explicitly lists rear corner damage as expected, normal rear-end damage — consistent with a defendant swerving to avoid the collision and only clipping the corner. The fact-check here is simply confirming the other car was behind Ben, in his lane, before impact — which Ben's account already establishes.",
    "reason": "QUALIFIED. Rear corner damage from a defendant who was behind Ben and swerved is explicitly the criteria's described pattern for rear-end accidents — not a lane dispute. Defendant insurance is active, Ben's own policy is active (Prop 213 satisfied), and injury/treatment within 30 days with no gaps are confirmed."
  },
  {
    "id": "n1-3",
    "num": "1.3",
    "title": "\"No Visible Damage, But the Trunk Won't Close\"",
    "category": "Rear-End Accidents",
    "disposition": "qualified",
    "story": "The caller is Sophia Marchetti, the driver — right person. The accident happened 4 days ago. Sophia was stopped at a stop sign when a car behind her tapped her bumper at low speed — \"it really wasn't a hard hit, I almost didn't think it was worth calling about.\" No police were called; the other driver, apologetic, gave Sophia his insurance info (Nationwide, confirmed active). When the rep asks about damage, Sophia says, \"Honestly, looking at the bumper, you almost can't tell anything happened — but my trunk won't latch shut anymore, it just pops back open.\" Sophia has mild neck soreness and saw a chiropractor 3 days after the accident, with a follow-up scheduled. Her own policy is active.",
    "nuance": "Reps trained to be wary of \"low property damage\" cases may hear \"you almost can't tell anything happened\" and start worrying this is a dead case. The criteria is explicit: a bumper with no visible damage but a trunk that won't close is GOOD PD — we should definitely move forward with cases like this. The case should not be treated as a zero-damage case requiring photo review.",
    "reason": "QUALIFIED. The non-functional trunk latch satisfies the property damage requirement per the criteria's explicit example, even with a bumper that looks undamaged. Defendant insurance is active, Sophia's own policy is active, and injury/treatment within the 30-day window are confirmed."
  },
  {
    "id": "n1-4",
    "num": "1.4",
    "title": "Both Vehicles Show Zero Visible Damage",
    "category": "Rear-End Accidents",
    "disposition": "conditional",
    "story": "The caller is Andre Phillips, the driver — right person. The accident happened 5 days ago. Andre was stopped at a light when a car bumped into his rear bumper at what he describes as \"barely a roll — like 2 miles an hour, if that.\" Both drivers got out, looked at both cars, and \"honestly couldn't find a single mark on either car — not even a scuff.\" They exchanged insurance anyway; the other driver carries Progressive, confirmed active. Andre felt a little stiffness in his neck that he initially brushed off, but it got worse over the next two days, so he saw his primary doctor, who diagnosed a mild strain and recommended rest and OTC pain relief, with a follow-up if it doesn't improve.",
    "nuance": "This is the genuinely ambiguous case the criteria anticipates separately from the \"trunk won't close\" pattern in 1.3. Here, BOTH vehicles show truly nothing — no functional damage, no cosmetic damage, nothing. The criteria doesn't say reject this outright, but it doesn't say sign it outright either: it says we may request photos to confirm whether to move forward.",
    "reason": "CONDITIONAL — request photos of both vehicles before deciding. If photos reveal any impact evidence (even minor scuffing, paint transfer, etc.), proceed normally; if truly nothing is visible on either vehicle, consult the manager/group chat before signing. Liability, insurance, and injury/treatment timing are otherwise in order."
  },
  {
    "id": "n1-5",
    "num": "1.5",
    "title": "\"I Was Rear-Ended\" — But the Damage Is on the Front",
    "category": "Rear-End Accidents",
    "disposition": "not_qualified",
    "story": "The caller is David Chen, calling about his own accident — right person. The accident happened 3 weeks ago on a weekday morning. David opens with, \"I was rear-ended on the freeway and now my neck hurts.\" When the rep asks where the damage is on his car, David pauses: \"Um, it's on the front — I guess I hit the car in front of me. But it's because the guy behind ME hit ME first and pushed me into them.\" Pressed further, David admits there was no vehicle behind him — traffic ahead braked hard, and David, following too closely while looking at his phone, couldn't stop in time and struck the car ahead. No police came; insurance was exchanged. David's front bumper is dented and his headlight is cracked. He saw a chiropractor 5 days later for neck pain.",
    "nuance": "\"I was rear-ended\" is the phrase that makes reps relax — but the damage location (front bumper, David's car) and his own retelling reveal he is the rear driver in this collision. There is no second vehicle that struck HIM; he invented one when first asked, and walked it back under questioning.",
    "reason": "NOT QUALIFIED. David is the at-fault driver — he struck the vehicle ahead of him while following too closely. The criteria does not sign the at-fault driver unless there is catastrophic injury or death, requiring manager consultation before rejecting; chiropractic care for neck pain does not meet that bar."
  },
  {
    "id": "n1-6",
    "num": "1.6",
    "title": "Rear-Ended After a Deliberate Brake-Check, With Dashcam",
    "category": "Rear-End Accidents",
    "disposition": "escalate",
    "story": "The caller is Jordan Reyes, the driver — right person. The accident happened 8 days ago during evening traffic. Jordan says another driver cut sharply in front of him with no signal, then immediately slammed on the brakes — \"it felt deliberate, like road rage.\" Jordan rear-ended that car. Jordan has a dashcam, and the footage clearly shows the other car cutting in front with inches to spare and braking hard almost immediately, with no traffic ahead requiring it. No police were called; insurance was exchanged, and the other driver carries Mercury, confirmed active. Jordan has neck pain and saw a chiropractor 4 days later, no gaps. His front bumper is dented and the grille is cracked.",
    "nuance": "Normally the rear driver is at fault, full stop — Jordan's own bumper damage would otherwise mirror Scenario 1.5. But Jordan has dashcam footage of a deliberate cut-in-and-brake-check with no traffic justification. That footage is the independent evidence that can shift the liability analysis away from \"rear driver automatically at fault\" toward the other driver's intentional conduct.",
    "reason": "ESCALATE — potentially qualified with the dashcam. Without footage, Jordan's own story (he struck the car ahead) would place him at fault, as in 1.5. With dashcam evidence of a deliberate brake-check, liability may shift to the other driver — this needs attorney/manager review of the footage rather than a rep-level determination either way."
  },
  {
    "id": "n1-7",
    "num": "1.7",
    "title": "Pushed Into the Car Ahead in a Chain Reaction",
    "category": "Rear-End Accidents",
    "disposition": "qualified",
    "story": "The caller is Felicia Adams, the driver — right person. The accident happened 7 days ago. Felicia was stopped in traffic on a city street, three cars back from a light. She felt a hard hit from behind that pushed her car forward into the car in front of her — \"I felt two hits, bang-bang, one right after the other.\" The car ahead of Felicia is now, through its insurance, making a claim against her. The driver who hit Felicia from behind admitted fault and was cited by responding police for following too closely; his insurance (Geico) is active. Felicia has neck and shoulder pain, went to urgent care the next day, and has started chiropractic care, no gaps. Her front and rear bumpers both show damage.",
    "nuance": "\"I hit the car in front of me\" sounds like shared fault, and the claim from the front car against Felicia reinforces that fear. But Felicia's account — one impact from behind that pushed her into the car ahead, \"bang-bang\" — describes being PUSHED, not independently striking anyone. There was one originating impact: the rear driver, who was cited.",
    "reason": "QUALIFIED. Felicia was rear-ended and pushed into the car ahead — a single originating impact from the cited rear driver, who has active insurance. The front car's claim against Felicia also properly runs to the rear driver's policy. Injury and treatment within 30 days, no gaps, are confirmed."
  },
  {
    "id": "n1-8",
    "num": "1.8",
    "title": "Two Separate Impacts: PC Hit the Front Car First, Then Was Rear-Ended",
    "category": "Rear-End Accidents",
    "disposition": "escalate",
    "story": "The caller is Marcus Webb, the driver — right person. The accident happened 6 days ago. Marcus describes it carefully: \"I actually tapped the car in front of me first — I was looking down for like a second and bumped them, no big deal, light contact. Then maybe 10-15 seconds later, before either of us could even pull over, someone behind me hit me hard.\" Two separate, sequential impacts. The rear driver was cited for following too closely; his insurance (Allstate) is active. Marcus has neck pain, saw a chiropractor 5 days later. His front bumper has a light scuff from the first impact; his rear bumper is significantly dented from the second.",
    "nuance": "This is structurally different from 1.7 — there, ONE impact (from behind) pushed Felicia into the car ahead. Here, Marcus describes TWO separate, sequential impacts: he caused the first one (tapping the car ahead while not looking), and then was struck from behind by someone else entirely. Two impacts mean two separate liability pictures, and injury causation between them becomes difficult to untangle.",
    "reason": "ESCALATE. Only the second impact (the rear-end Marcus suffered) is potentially viable as Marcus's claim — and the front car's claim against Marcus for the first impact is legitimate, since Marcus caused that one. An attorney needs to evaluate whether the case is worth taking given the split liability and the difficulty of separating which injuries came from which impact."
  },
  {
    "id": "n1-9",
    "num": "1.9",
    "title": "Insurance Blames the PC, But the Facts and UM Save the Case",
    "category": "Rear-End Accidents",
    "disposition": "qualified",
    "story": "The caller is Angela Brooks, the driver — right person. The accident happened 11 days ago. Angela was driving in normal traffic when the car ahead of her began merging halfway into a turn lane, then suddenly braked hard. Angela braked in time and did NOT hit that car — but the car behind Angela then rear-ended her. Angela has photos of the scene and her rear bumper damage. The driver who hit her was uninsured. When Angela called her own insurer to ask about the rear driver being uninsured, the adjuster mentioned the rear driver's side is \"arguing you braked suddenly without cause\" — but Angela maintains she only braked because the car ahead did. Angela has neck, back, and shoulder pain; she went to urgent care two days later and started chiropractic care, no gaps. Angela confirms she has UM coverage on her own active policy.",
    "nuance": "An insurance company arguing the PC is at fault is not, by itself, a disqualifier — it's an argument, and the physical facts control. Angela did NOT hit the car ahead (no front damage, photos support this), and was struck only from behind. Separately, the rear driver being uninsured would normally be fatal — except Angela has UM, which the criteria allows as the coverage path when the defendant has no insurance and the PC is not at fault.",
    "reason": "QUALIFIED. Angela was rear-ended and did not strike the car ahead (supported by photos and lack of front damage) — she is not at fault despite the insurer's argument. The at-fault rear driver is uninsured, but Angela's own UM coverage provides the insurance path the criteria requires, and her policy being active also satisfies Prop 213. Injury and treatment within 30 days, no gaps, are confirmed."
  },
  {
    "id": "n2-1",
    "num": "2.1",
    "title": "Defendant's Unprotected Left, PC Going Straight (Standard)",
    "category": "Left Turn Cases",
    "disposition": "qualified",
    "story": "The caller is Renee Castillo, the driver — right person. The accident happened 10 days ago around 6 PM. Renee was driving straight through a signalized intersection on a green light — no turn intended. A car coming from the opposite direction, attempting to turn left onto a side street, pulled into the intersection without an arrow and without yielding, and struck the front passenger side of Renee's car. Police responded; the report cites the other driver for failing to yield while turning left across oncoming traffic. The other driver has Geico insurance, confirmed active. Renee has neck and shoulder pain, went to the ER that night, and started physical therapy 5 days later, no gaps. Her front bumper and headlight are damaged. Renee's own policy was active on the DOL.",
    "nuance": "This is the textbook Left vs Straight pattern — the defendant failed to yield on an unprotected left turn directly into Renee's right of way. The only thing for the rep to confirm beyond the obvious is that Renee genuinely had no intent to turn (ruling out a lane-merge or mutual-turn dispute) and that her own policy was active for Prop 213.",
    "reason": "QUALIFIED. Defendant failed to yield on an unprotected left turn, cited by police. Defendant insurance is active, Renee's own policy was active (Prop 213 satisfied), and injury/treatment within 30 days are confirmed."
  },
  {
    "id": "n2-2",
    "num": "2.2",
    "title": "Defendant's Unprotected Left, PC T-Bones the Defendant",
    "category": "Left Turn Cases",
    "disposition": "qualified",
    "story": "The caller is Angela Brooks, the injured driver — right person. The accident happened 11 days ago around 6 PM. Angela was driving straight through a signalized intersection on a green light — no intention to turn. A car traveling in the opposite direction, making a left turn onto a side street, pulled into the intersection without an arrow and without yielding. Angela had no time to brake and struck the front passenger side of his car with the FRONT of her own car — full frontal damage to Angela's vehicle. Police arrived and the report cites the other driver for failing to yield while turning left across oncoming traffic. The other driver has Geico insurance, confirmed active. Angela suffered a mild concussion and whiplash; she went to the ER that night and started physical therapy 6 days later. Her front bumper, hood, and both headlights are destroyed — the car was towed. Angela's own insurance was active.",
    "nuance": "Angela's car has FULL FRONTAL damage — she physically struck the other vehicle. A rep who hears \"Angela hit the other car\" and stops there will misclassify this as Angela's fault. The actual question is who had the right of way: Angela was going straight on green; the defendant turned left without a protected arrow and failed to yield. The criteria explicitly allows signing when the PC t-bones the defendant under these facts.",
    "reason": "QUALIFIED. Defendant made an unprotected left turn and failed to yield to Angela's right of way (confirmed by police citation). Angela's frontal damage does not change liability. Defendant insurance is active and Angela's own policy was active (Prop 213 satisfied). Injury (concussion, whiplash) and treatment (ER same night, PT within 30 days) both meet the criteria."
  },
  {
    "id": "n2-3",
    "num": "2.3",
    "title": "PC Made the Unprotected Left Turn (Soft Tissue Only)",
    "category": "Left Turn Cases",
    "disposition": "not_qualified",
    "story": "The caller is Marcus Webb, the driver — right person. The accident happened 5 days ago at around 4:30 PM. Marcus came to an intersection wanting to turn left onto a cross street. He says the light was \"green, just a regular green, no arrow.\" He saw oncoming traffic but felt there was \"enough of a gap,\" and began his turn. A car traveling straight through the intersection from the opposite direction struck the driver's side of Marcus's car as he completed the turn. Marcus says, \"He had to be going at least 20 over, there's no way he was that close when I started turning.\" No witnesses stopped. Police responded, and the report states Marcus failed to yield while making a left turn. The other driver has Progressive, confirmed active. Marcus has soreness in his shoulder and lower back; he went to urgent care two days later and was told he has a mild strain — no fractures, no hospitalization, no loss of consciousness.",
    "nuance": "Marcus is the one who made the turn on a solid green with no protected arrow, directly into oncoming traffic that had the right of way. His \"he was speeding\" claim is unsupported by any witness, dashcam, or report finding — the police report places fault on Marcus. The injuries described (soreness, mild strain, urgent care) are not catastrophic.",
    "reason": "NOT QUALIFIED. Per the criteria, if the PC is the one making the unprotected left-hand turn, they are at fault and we do not sign — unless there is catastrophic injury or death, requiring manager consultation before rejecting. Marcus's injuries do not meet that exception."
  },
  {
    "id": "n2-4",
    "num": "2.4",
    "title": "PC Made the Unprotected Left Turn, But a Passenger Died",
    "category": "Left Turn Cases",
    "disposition": "escalate",
    "story": "The caller is Harold Webb, Marcus's father, calling on behalf of the family — the rep confirms Marcus survived but is recovering and that Harold has authority to discuss the case on the family's behalf given the circumstances (right person, with context). The accident happened 9 days ago. Marcus, again, was making a left turn on a solid green with no protected arrow when a car traveling straight through the intersection — going what witnesses estimated as significantly over the speed limit — struck the driver's side of Marcus's car with great force. Marcus's mother, a passenger in the front seat, was killed in the collision. Police are still investigating but their preliminary report notes Marcus failed to yield while turning left; it ALSO notes that witness statements describe the other vehicle traveling well above the posted speed limit. The other driver has Progressive insurance, active. Marcus suffered multiple fractures and is hospitalized.",
    "nuance": "On its face, this is the same disqualifying pattern as 2.3 — PC making an unprotected left turn, cited for failing to yield. But two facts change everything: a passenger died, and there is witness testimony suggesting the other driver was traveling well above the speed limit (potential comparative fault). The criteria's note on unprotected left turns explicitly carves out exactly this situation.",
    "reason": "ESCALATE — do not reject. The criteria requires consulting the manager before rejecting an at-fault unprotected-left-turn case when there is catastrophic injury or death. Here there is a fatality, multiple fractures, AND witness evidence of excessive speed by the other driver that could support comparative fault. This must go to the manager/attorney, not be dispositioned by the rep."
  },
  {
    "id": "n2-5",
    "num": "2.5",
    "title": "Protected Left Arrow, Verified at the Intersection",
    "category": "Left Turn Cases",
    "disposition": "qualified",
    "story": "The caller is Denise Okafor, the driver — right person. The accident happened 8 days ago around 7 PM. Denise was waiting to turn left at a signalized intersection. She describes it: \"The light turned red for through traffic, then I got a green arrow, so I started my turn — and a car came straight through from the other direction and hit my passenger side. He had to have run his red.\" Police responded and the report notes Denise had a green arrow at the time and cites the other driver for failing to stop at a red signal. The other driver has State Farm, confirmed active. Denise has neck pain and a bruised hip; she went to urgent care the next day and started chiropractic care 4 days later, no gaps. Her passenger side door and rear quarter panel are dented.",
    "nuance": "Protected-arrow left turns flip left-turn liability completely in PC's favor — but the criteria includes a specific instruction here: ALWAYS check the intersection to confirm a left-turn arrow actually exists there. This isn't about doubting Denise; it's a standard verification step before relying on a protected-arrow story, since the difference between \"protected\" and \"unprotected\" left turns is the difference between QUALIFIED and NOT QUALIFIED.",
    "reason": "QUALIFIED — after the rep verifies (via map/street view or the police report itself) that this intersection has a protected left-turn arrow signal. The police report already supports Denise's account (citing the other driver for the red light) and corroborates the arrow. Defendant insurance active, Denise's own policy active (Prop 213 satisfied), injury and treatment within 30 days confirmed."
  },
  {
    "id": "n2-6",
    "num": "2.6",
    "title": "Claimed Green Arrow, But the Intersection Has None",
    "category": "Left Turn Cases",
    "disposition": "not_qualified",
    "story": "The caller is Travis Holt, the driver — right person. The accident happened 7 days ago around 8 PM. Travis describes waiting to turn left at an intersection: \"I had a green arrow, so I went, and this guy just plowed through going straight and hit me.\" No police report was made — both drivers exchanged insurance at the scene; the other driver carries Farmers, confirmed active. Travis has neck soreness, saw a chiropractor 5 days later. His driver's side door is dented. When the rep pulls up the intersection on a map to verify the protected arrow Travis described, the intersection shows only a standard two-phase signal — there is no left-turn arrow signal at that location at all, in either direction.",
    "nuance": "This is exactly why the criteria says ALWAYS verify the intersection. Travis's account hinges entirely on having had a protected green arrow — but that signal type doesn't exist at this intersection. Either Travis is mistaken about what he saw, or the story doesn't hold up. Either way, without a protected arrow, Travis made an unprotected left turn into oncoming traffic.",
    "reason": "NOT QUALIFIED. With no left-turn arrow signal existing at this intersection, Travis's turn was necessarily unprotected — meaning he failed to yield to oncoming traffic with the right of way. Per the criteria, an at-fault unprotected left turn is not signed absent catastrophic injury or death (manager consult), which does not apply here (soreness, chiropractic care only)."
  },
  {
    "id": "n3-1",
    "num": "3.1",
    "title": "Defendant Merging Into PC's Established Lane",
    "category": "Lane Merges & Sideswipes",
    "disposition": "qualified",
    "story": "The caller is Priya Anand, the driver — right person. The accident happened 2 weeks ago around 8 AM during the morning commute. Priya was driving in the right lane of a three-lane highway, had been in that lane for at least a mile, not changing lanes, doing the speed of traffic. A car in the middle lane began merging right into Priya's lane — \"He just drifted over, I think he didn't see me, there was no signal.\" The merging car's rear quarter panel struck the front driver's side of Priya's car. No independent witness, no dashcam. No police report — both drivers pulled to the shoulder and exchanged information; the other driver has Allstate, claim \"under review.\" Priya has neck pain and a sore wrist; saw her PCP 4 days later (X-ray negative), started PT a week after that. Front bumper and driver's side fender dented, wheel well scraped. Priya's own policy was active.",
    "nuance": "No witness, no dashcam, no police report — on paper this looks like the \"tricky lane merge, can't prove it\" pattern reps fear. But the criteria's actual rule is: unless the PC's OWN story places them at fault (i.e., the PC was merging), we can sign. Priya was established in her lane for over a mile; the OTHER driver was merging. The independent-witness requirement is for disputes where it's unclear who was established and who was moving — not this case.",
    "reason": "QUALIFIED. Priya's own account places the defendant as the merging vehicle drifting into her established lane — her story does not place her at fault. Defendant insurance is reviewing the claim; Priya's own policy was active (Prop 213 satisfied). Injury and treatment within 30 days confirmed."
  },
  {
    "id": "n3-2",
    "num": "3.2",
    "title": "PC Is the Merging Driver",
    "category": "Lane Merges & Sideswipes",
    "disposition": "not_qualified",
    "story": "The caller is Tyler Brooks, the driver — right person. The accident happened 6 days ago, around 5 PM in heavy traffic. Tyler was in the far-left lane of a highway and needed to exit, so he began merging right across two lanes. As he moved into the middle lane, his rear bumper made contact with the front of a car traveling straight in that lane. \"I had my signal on, he just sped up instead of letting me in.\" No witness, no dashcam — Tyler's brother, a passenger in his car, is the only other person who saw it. No police report; insurance exchanged, the other driver's State Farm active. Tyler has lower back pain, saw a chiropractor 9 days after. Rear bumper scraped and dented on the right side.",
    "nuance": "Tyler's own narrative places him as the vehicle changing lanes/merging across traffic, struck while moving into another lane. The only \"witness\" is his brother, a passenger in his own car — not independent. Without independent evidence, and with Tyler's story itself describing him as the merging vehicle, liability cannot be established in PC's favor.",
    "reason": "NOT QUALIFIED. The criteria states that unless the PC's story places them at fault, we can sign on a lane merge — here, Tyler's own story places him as the merging vehicle. A passenger riding with Tyler is not independent. Without independent evidence supporting Tyler, this does not meet the criteria for a lane-merge dispute."
  },
  {
    "id": "n3-3",
    "num": "3.3",
    "title": "Both Vehicles Merging Simultaneously Into the Same Lane",
    "category": "Lane Merges & Sideswipes",
    "disposition": "escalate",
    "story": "The caller is Nicole Foster, the driver — right person. The accident happened 9 days ago around 6 PM on a highway with a lane that was ending. Nicole says, \"I was in the lane that was closing, so I had to move over — and at the exact same time, this other car was also moving over from the far lane on the other side, into the same middle lane I was going into. We basically met in the middle.\" Their front-side panels collided. No witness, no dashcam, no police report — insurance exchanged, the other driver's Mercury policy active. Nicole has neck and shoulder pain; saw urgent care 3 days later, soft tissue strain diagnosed, one follow-up scheduled. Driver's side front fender and mirror damaged.",
    "nuance": "Unlike 3.1 (defendant merging into PC's established lane) or 3.2 (PC alone merging), here BOTH vehicles were merging at the same moment — Nicole's own story places HER as a merging vehicle too, even though the other driver was also merging. PC cannot claim the established-lane position, and there's no independent evidence to sort out who had priority.",
    "reason": "ESCALATE, leaning NOT QUALIFIED. Nicole's own story includes her as a merging vehicle, not an established-lane driver — liability is genuinely murky between two simultaneously-merging cars. Without an independent witness or dashcam favoring Nicole, this does not meet the criteria's bar for a lane-merge dispute."
  },
  {
    "id": "n3-4",
    "num": "3.4",
    "title": "Phantom Driver Swerve, No Evidence",
    "category": "Lane Merges & Sideswipes",
    "disposition": "not_qualified",
    "story": "The caller is Connor Ellis, the driver — right person. The accident happened 5 days ago around 7 AM. Connor describes: \"I was driving in the middle lane, and this car started drifting toward me — like they were about to hit me — so I swerved right to avoid them, and that's when I hit the car in the right lane. The other guy who almost hit me just kept going, didn't even slow down.\" Connor didn't get a plate; no dashcam; his passenger (a coworker he carpools with) is the only other person in the car. Police responded and the report cites Connor for an unsafe lane change into the car he actually struck; that driver's insurance (Travelers) is active. Connor has neck and back pain, saw urgent care the next day.",
    "nuance": "Emotionally, the phantom driver \"caused everything.\" Legally, the only provable collision is Connor entering another lane and hitting someone — and the police report agrees, citing Connor for the unsafe lane change. His coworker-passenger is not an independent witness, and there's no plate, dashcam, or anyone else who saw the phantom car.",
    "reason": "NOT QUALIFIED (manager review only if strong evidence appears). Connor's own story and the police report place him at fault for the actual collision — entering another lane and striking a vehicle there. There is no independent proof of the phantom driver that forced the swerve."
  },
  {
    "id": "n3-5",
    "num": "3.5",
    "title": "Phantom Driver Swerve, With Dashcam and PC's UM",
    "category": "Lane Merges & Sideswipes",
    "disposition": "qualified",
    "story": "The caller is Connor Ellis, the driver — right person. The accident happened 6 days ago around 7 AM, an identical-sounding fact pattern: a car drifted toward Connor, he swerved right to avoid it, and struck a car in the right lane; the phantom driver fled without stopping. BUT Connor has a dashcam, and the footage clearly shows the other vehicle crossing the lane line into Connor's lane just before he swerved — with no signal, forcing the evasive maneuver. The police report still notes Connor's vehicle struck the car in the right lane, but Connor's dashcam footage was provided to the officer and referenced in the report as supporting evidence of an \"unidentified third vehicle causing an emergency maneuver.\" Connor has neck pain, treated promptly. When asked about his own coverage, Connor confirms he has an active policy with UM.",
    "nuance": "Same swerve, same outcome (striking a car in the right lane) — but the dashcam converts an at-fault lane change into a provable evasive action caused by another driver. Because that driver fled and is unidentified, the coverage path becomes Connor's own UM, treated like a hit-and-run by the phantom vehicle. UM can only be used if Connor is not at fault — and the dashcam is what establishes that.",
    "reason": "QUALIFIED. Dashcam footage, referenced in the police report, documents the phantom vehicle forcing Connor's evasive maneuver — establishing Connor was not at fault for the swerve. The phantom driver fled (effectively a hit-and-run), but Connor's active UM coverage provides the insurance path the criteria requires, and also satisfies Prop 213. Injury and treatment within 30 days confirmed."
  },
  {
    "id": "n4-1",
    "num": "4.1",
    "title": "Light Dispute, Defendant Ran the Red, Witness on Report",
    "category": "Light Disputes & Stop Signs",
    "disposition": "qualified",
    "story": "The caller is Olivia Bennett, the driver — right person. The accident happened 7 days ago around 3 PM. Olivia was going straight through an intersection on a green light. A car coming from the cross street ran their red light and struck the front passenger side of Olivia's car. Police responded; the report includes a statement from a pedestrian waiting at the corner who confirms Olivia had the green and the other driver \"blew through the red without slowing.\" The other driver was cited for running the red light and carries Allstate, confirmed active. Olivia has whiplash and a bruised knee; she went to the ER that night and started PT 5 days later, no gaps. Front bumper and passenger door damaged. Olivia's own policy is active.",
    "nuance": "This is the criteria's defined \"Light Dispute\" pattern in its cleanest form — PC going straight on green, defendant runs the cross-street red, and there's an independent witness statement in the police report on top of the citation. The supporting witness strengthens it but the structure itself (straight on green vs. red-runner) is what qualifies.",
    "reason": "QUALIFIED. PC had the right of way (green light) and the defendant ran the red, cited by police with an independent witness statement on record. Defendant insurance active, PC's own policy active (Prop 213 satisfied), injury and treatment within 30 days confirmed."
  },
  {
    "id": "n4-2",
    "num": "4.2",
    "title": "Light Dispute, Both Claim Green, No Evidence",
    "category": "Light Disputes & Stop Signs",
    "disposition": "not_qualified",
    "story": "The caller is Marcus Webb, the driver — right person. The accident happened 6 days ago around midday. Marcus was going through an intersection and says he had a green light; the other driver, coming from the cross street, also insists THEY had a green light. The cars collided in the intersection — front-end damage to both vehicles. No police were called; both drivers exchanged insurance, with the other driver's policy (Geico) confirmed active. No cameras at the intersection that either driver knows of, no witnesses stopped, no dashcam in either car. Marcus has neck and shoulder pain, saw a chiropractor 4 days later.",
    "nuance": "Both stories cancel each other out. Damage proves a collision happened in the intersection — it cannot prove whose light was actually green. Without ANY independent evidence (witness, dashcam, traffic camera, police report assigning fault), there is no way to establish that Marcus had the right of way.",
    "reason": "NOT QUALIFIED. A pure he-said/she-said light dispute with no independent evidence does not establish PC's right of way. Re-screen if a witness, nearby camera footage, or an updated police report later surfaces supporting Marcus's account."
  },
  {
    "id": "n4-3",
    "num": "4.3",
    "title": "\"Stop Sign Dispute\" That's Actually a Through-Street Failure to Yield",
    "category": "Light Disputes & Stop Signs",
    "disposition": "qualified",
    "story": "The caller is Yolanda Ramirez, the driver — right person. The accident happened 9 days ago. Yolanda initially describes it as \"a stop sign accident.\" When the rep digs in: \"I was just driving down my street, no stop sign on my side — the other car was at the stop sign on the cross street, and they pulled out right in front of me.\" So only the cross street had a stop sign; Yolanda's street was a through street with no sign. The other driver was cited for failing to stop/yield at the stop sign before entering the through street. Insurance (Farmers) confirmed active. Yolanda has neck pain, treated within the week.",
    "nuance": "Yolanda's framing — \"stop sign accident\" — triggers the reflex to ask for an independent witness, since four-way stop disputes require one. But this isn't a four-way stop dispute at all: only ONE street had a sign, and that driver pulled out into a through street without yielding. This is a failure-to-yield case (entering a main road), which doesn't carry the independent-witness requirement.",
    "reason": "QUALIFIED. The defendant had the duty to stop and yield before entering the through street and was cited for failing to do so. Misclassifying this as a \"stop sign dispute\" requiring a witness would wrongly kill a good case. Defendant insurance active, injury and treatment within 30 days confirmed."
  },
  {
    "id": "n4-4",
    "num": "4.4",
    "title": "Four-Way Stop, Independent Witness on the Police Report",
    "category": "Light Disputes & Stop Signs",
    "disposition": "qualified",
    "story": "The caller is Janet Forsythe, the driver — right person. The accident happened 10 days ago at approximately 2 PM at a residential four-way stop. Janet says she came to a complete stop, looked both ways, saw the cross-traffic car also stopped, and proceeded believing she'd arrived first. The other driver proceeded at the same moment, and the front of his car struck the passenger side of Janet's car in the middle of the intersection. Both drivers insist they arrived first. However, a pedestrian walking their dog on the corner saw the whole thing, stopped to help, and gave their contact info to the responding officer — the police report lists this person as a witness stating the cross-traffic car \"rolled through without fully stopping\" before Janet entered. The other driver has Farmers, confirmed active. Janet has neck and shoulder pain; went to urgent care the same day, started chiropractic care 4 days later. Passenger door dented, side mirror broken off. Janet's own policy active.",
    "nuance": "Four-way stop disputes are the category reps are most trained to reject for lack of proof — but the criteria's bar is specific: an INDEPENDENT witness or dashcam indicating who had the right of way. Here, an unrelated pedestrian — someone with no connection to either driver — gave a statement to police supporting Janet's account. That single fact converts an unprovable he-said/she-said into a documented, signable case.",
    "reason": "QUALIFIED. An independent, unconnected witness is documented in the police report supporting Janet's right of way at the four-way stop. Defendant insurance active and Janet's own policy active (Prop 213 satisfied). Injury and same-day treatment confirmed."
  },
  {
    "id": "n4-5",
    "num": "4.5",
    "title": "Four-Way Stop, Only a Passenger-Relative as \"Witness\"",
    "category": "Light Disputes & Stop Signs",
    "disposition": "not_qualified",
    "story": "The caller is Robert Diaz, the driver — right person. The accident happened 8 days ago at around 7:45 AM at a four-way stop near a school. Robert says he stopped, waited \"a couple seconds,\" and proceeded; the other driver, arriving from Robert's right, also proceeded at the same time, and their front bumpers collided in the intersection. Both drivers' stories conflict — the other driver claims Robert \"barely tapped his brakes\" and didn't fully stop. No officer was called. There were no pedestrians, no other cars stopped nearby, neither vehicle has a dashcam. Robert's 16-year-old daughter, a passenger on the way to school, says she \"saw the whole thing and dad stopped first\" — but she was in the car with him. The other driver has Mercury, confirmed active. Robert has mild neck soreness; saw his primary doctor 6 days later, recommended OTC pain relief and rest, no further treatment scheduled.",
    "nuance": "This is the textbook unresolvable four-way stop — both drivers blame each other, no police report exists, and the only \"witness\" is Robert's own daughter riding in his car. A family member/passenger in the PC's vehicle does not satisfy the independent-witness requirement, no matter how confident their account is.",
    "reason": "NOT QUALIFIED. The criteria requires an independent witness or dashcam footage to move forward on a stop-sign dispute. Robert's daughter, a passenger in his own vehicle, is not independent, and no other evidence exists. Without that, liability cannot be established in Robert's favor."
  },
  {
    "id": "n5-1",
    "num": "5.1",
    "title": "Defendant Pulls Out of a Residential Side Street Onto a Boulevard",
    "category": "Entering A Main Road / Failure To Yield",
    "disposition": "qualified",
    "story": "The caller is Kevin Marsh, the driver — right person. The accident happened 8 days ago around 4 PM. Kevin was driving on a four-lane boulevard, no turns, just traveling straight. A car emerged from a residential side street to Kevin's right — there was a stop sign for that street — and pulled out into the boulevard directly in front of Kevin without yielding to oncoming traffic. Kevin struck the side of that car. Police responded and cited the other driver for failing to yield when entering the roadway from a stop sign. The other driver has Travelers, confirmed active. Kevin has neck and back pain; went to urgent care the next day, started PT 6 days later, no gaps. Front bumper and hood damaged. Kevin's own policy is active.",
    "nuance": "This is the criteria's clean \"entering a main road\" pattern: the defendant came from a smaller street with a stop sign and had the duty to yield to traffic already on the main road before entering. Kevin was established and traveling straight on the boulevard with no maneuver of his own.",
    "reason": "QUALIFIED. The defendant failed to yield when entering the main road from a stop sign, cited by police. Defendant insurance active, Kevin's own policy active (Prop 213 satisfied), injury and treatment within 30 days confirmed."
  },
  {
    "id": "n5-2",
    "num": "5.2",
    "title": "Defendant Pulls Out of a Shopping Center Driveway",
    "category": "Entering A Main Road / Failure To Yield",
    "disposition": "qualified",
    "story": "The caller is Latisha Greene, the driver — right person. The accident happened 6 days ago around 1 PM. Latisha was driving on a road that runs past a shopping center. A car pulled out of the shopping center's driveway, attempting to enter the road, and struck the passenger side of Latisha's car as she passed. The driveway has no traffic signal — just a stop bar painted on the pavement. Police were not called; insurance was exchanged at the scene, and the other driver carries State Farm, confirmed active. The other driver told Latisha, \"I'm sorry, I didn't see you, I thought it was clear.\" Latisha has neck soreness, saw a chiropractor 4 days later. Passenger door and rear quarter panel dented.",
    "nuance": "This is the same \"entering a main road\" pattern as 5.1, just from a different kind of access point — a shopping center driveway rather than a residential street. The criteria explicitly lists driveways, shopping centers, residences, and other places of business as locations where the defendant has the same duty to yield before entering the road. Even without a police report, the other driver's own admission (\"I didn't see you, thought it was clear\") supports the liability picture.",
    "reason": "QUALIFIED. The defendant exited a shopping center driveway and failed to yield to Latisha, who was already traveling on the road — explicitly covered by the criteria's failure-to-yield provisions for driveways/shopping centers/places of business. Defendant insurance active, Latisha's own policy active, injury and treatment within 30 days confirmed."
  },
  {
    "id": "n5-3",
    "num": "5.3",
    "title": "Defendant Pulls Out of a Parallel Parking Spot",
    "category": "Entering A Main Road / Failure To Yield",
    "disposition": "qualified",
    "story": "The caller is Samuel Okoye, the driver — right person. The accident happened 5 days ago around 11 AM. Samuel was driving down a city street with parallel parking on both sides. A car that had been parked at the curb suddenly pulled out into traffic without checking for oncoming cars, and struck the side of Samuel's car as he passed. Samuel says, \"One second they were just sitting there parked, then they just pulled right out into me.\" No police were called; insurance exchanged, the other driver's Progressive policy confirmed active. Samuel has lower back pain, saw urgent care 3 days later, soft tissue strain diagnosed.",
    "nuance": "At first hearing, \"a parked car pulled out and hit me\" can sound like a sideswipe or lane-merge dispute to a rep scanning for keywords — and lane disputes sometimes require independent evidence. But this is not a lane merge: a vehicle that was PARKED at the curb has a duty to yield to passing traffic before pulling out, per the criteria's explicit failure-to-yield provisions.",
    "reason": "QUALIFIED. The defendant was parallel parked and pulled out without yielding to Samuel's passing vehicle — covered by the criteria's failure-to-yield provisions for parked vehicles re-entering traffic. Defendant insurance active, Samuel's own policy active, injury and treatment within 30 days confirmed."
  },
  {
    "id": "n5-4",
    "num": "5.4",
    "title": "Defendant Turns Right on Red Into Oncoming Traffic",
    "category": "Entering A Main Road / Failure To Yield",
    "disposition": "qualified",
    "story": "The caller is Whitney Park, the driver — right person. The accident happened 7 days ago around 9 AM. Whitney was traveling through an intersection on a green light. A car that had been stopped at a red light in the rightmost lane of the cross street made a right turn on red and pulled directly into Whitney's path — Whitney struck the side of that car. Police responded and cited the other driver for an unsafe turn / failure to yield when turning right on red. The other driver has Mercury, confirmed active. Whitney has neck pain and a sore wrist; saw a chiropractor 4 days later, no gaps. Front bumper and passenger-side fender damaged.",
    "nuance": "Right-on-red is legal — but only after yielding to traffic with the right of way. Some reps hear \"the other driver had a legal right to turn on red\" and treat this as a disputed-right-of-way situation needing extra proof. It isn't: pulling into oncoming traffic that already has the green is a failure to yield, exactly as the criteria describes, and here it's backed by a citation.",
    "reason": "QUALIFIED. The defendant turned right on red without yielding to Whitney's oncoming traffic with the green light, cited by police — explicitly the failure-to-yield pattern the criteria covers for right-turning vehicles. Defendant insurance active, Whitney's own policy active, injury and treatment within 30 days confirmed."
  },
  {
    "id": "n5-5",
    "num": "5.5",
    "title": "PC Is the One Who Failed to Yield Pulling Out of a Driveway",
    "category": "Entering A Main Road / Failure To Yield",
    "disposition": "not_qualified",
    "story": "The caller is Greg Halloway, the driver — right person. The accident happened 6 days ago around 2 PM. Greg was pulling out of a shopping center parking lot onto a busy boulevard. He says, \"I looked, I thought I had time — but this car came out of nowhere and clipped my front end. He had to be going way over the limit.\" Police were not called; insurance exchanged, the other driver's Allstate confirmed active. Greg's front bumper and headlight are damaged. Greg has neck soreness, saw urgent care 4 days later, mild strain diagnosed.",
    "nuance": "This is the mirror image of 5.1-5.4 — same fact pattern (vehicle entering a main road from a driveway, defendant struck while passing), but the roles are reversed: GREG is the one entering the road from the driveway, and the other car was already on the boulevard. Greg's \"he was speeding\" claim is unsupported by any witness, dashcam, or report.",
    "reason": "NOT QUALIFIED. Greg, exiting a driveway onto a main road, had the duty to yield to traffic already on the road — and his own account places him as the one who pulled out into the other car's path. Per the criteria, if the PC is the one who failed to yield, we do not sign unless there is catastrophic injury or death (manager consult), which does not apply here (mild strain)."
  },
  {
    "id": "n6-1",
    "num": "6.1",
    "title": "Police Vehicle, Lights/Sirens On, No UM",
    "category": "Government Vehicle Cases",
    "disposition": "not_qualified",
    "story": "The caller is Sandra Mitchell, the driver — right person. The accident happened 12 days ago at around 11 PM. Sandra was driving home through an intersection on what she believed was a green light. A police SUV came through the cross street at high speed, lights flashing and siren audible — Sandra heard it \"right before impact\" but didn't have time to react. The police vehicle struck the front passenger side of Sandra's car. An ambulance was called and she was transported to the ER, treated for a concussion and a fractured wrist (casted, non-surgical). An internal department report notes the officer was responding to a \"Code 3\" emergency call (lights/sirens) at the time; no citation was issued to either party. Sandra has continued treatment with an orthopedist and a neurologist. Her car was totaled. When asked about her own insurance, Sandra confirms she has an active policy but \"only the state minimum liability — I don't think I have that uninsured motorist thing.\"",
    "nuance": "Injury and treatment are strong — concussion, fracture, ongoing specialists, totaled vehicle. The disqualifier is unrelated to injury severity: the defendant is a police vehicle running lights and sirens on an emergency response. The criteria treats this as government immunity, and the ONLY thing that reopens it is the PC having UM — which Sandra does not.",
    "reason": "NOT QUALIFIED. Police vehicle with lights and sirens on responding to an emergency = immunity applies, no sign unless PC has UM. Sandra confirms no UM coverage. Despite serious injuries and a totaled vehicle, there is no available coverage path."
  },
  {
    "id": "n6-2",
    "num": "6.2",
    "title": "Police Vehicle, Lights/Sirens On, Chain Reaction",
    "category": "Government Vehicle Cases",
    "disposition": "qualified",
    "story": "The caller is Robert Jenkins, the driver — right person. The accident happened 9 days ago around 10 PM. Robert was stopped in traffic on a city street, three cars back from a red light. A police SUV, responding to an emergency call with lights and sirens active, failed to stop in time and rear-ended the car directly behind Robert, which was then pushed into Robert's car, which was pushed into the car in front of him — a four-car chain reaction. Robert's car has damage to both front and rear bumpers. He suffered neck pain, lower back pain, and headaches; went to the ER that night, chiropractic twice a week since. The department's internal report confirms lights/sirens were active, en route to a priority call. The driver of the car that hit Robert from behind has active insurance (Farmers), confirmed. Robert also confirms his own policy includes UM, $100,000 per person.",
    "nuance": "The instinct is to run straight at the police-immunity question — lights and sirens were active, so doesn't that end the case? But Robert's actual vehicle was struck by the car directly behind him, not by the police SUV. That car's own insurance covers its involvement in the collision regardless of why it was pushed into Robert — whatever dispute exists between that driver and the police department over fault is a separate matter between them, and doesn't block Robert's claim against that driver's policy. Police immunity only becomes the central question if Robert were trying to claim directly against the police vehicle itself.",
    "reason": "QUALIFIED. Robert's claim runs against the insurance of the car that physically struck him, which is active — that's the \"insurance to pursue\" here, independent of the police vehicle's lights/sirens immunity. Robert was fully stopped and pushed forward in the chain, consistent with not being at fault. Robert's own UM ($100,000 per person) is also available as a backup if that policy were ever found not to cover the loss. Injury (ER same day, ongoing chiropractic) and treatment within 30 days confirmed."
  },
  {
    "id": "n6-3",
    "num": "6.3",
    "title": "Police Vehicle, No Lights/Sirens, Routine Patrol Rear-End",
    "category": "Government Vehicle Cases",
    "disposition": "qualified",
    "story": "The caller is Cynthia Park, the driver — right person. The accident happened 6 days ago around 2 PM. Cynthia was stopped at a red light. A marked police cruiser, on what appeared to be routine patrol — no lights, no sirens, nothing indicating any kind of emergency — rear-ended her. The officer got out, apologized, and said he \"looked down at the laptop for a second.\" An internal report was generated; it confirms the vehicle was not responding to any call and had no lights or sirens active at the time. No citation was issued (officers typically aren't cited by their own department), but the report attributes the collision to the officer's inattention. Cynthia has neck pain, went to urgent care the next day, started chiropractic care, no gaps. Rear bumper crumpled, trunk inoperable.",
    "nuance": "Reps who hear \"police\" and reflexively reject lose this case. With no lights or sirens, there is no emergency-response immunity question — the criteria treats this as case-by-case, and a clear-liability rear-end (exactly this fact pattern) is the example the criteria gives of one that may be taken. The 6-month CA government SOL clock still needs tracking, but the case itself is not automatically barred.",
    "reason": "QUALIFIED. No lights/sirens means no emergency-response immunity bar, and this is clear-liability rear-end while Cynthia was fully stopped, with the officer's own internal report attributing the collision to inattention — exactly the takeable no-lights/no-sirens police case the criteria describes. Injury (urgent care next day, ongoing chiropractic, no gaps) is confirmed. Note for the file: track the CA 6-month government-claim SOL clock from the date of loss so the claim form gets filed in time."
  },
  {
    "id": "n6-4",
    "num": "6.4",
    "title": "City Work Truck, California, 7 Months Ago",
    "category": "Government Vehicle Cases",
    "disposition": "not_qualified",
    "story": "The caller is Pauline Esposito, the driver — right person. The accident happened approximately 7 months ago in California. Pauline was rear-ended by a city-owned utility truck while stopped at a light; the truck driver was on duty performing routine maintenance work. A report was made at the time documenting the city vehicle and the collision. Liability is clear — Pauline was stopped, the truck struck her from behind. She began treatment within a few days of the accident and has been treating consistently with her chiropractor ever since, no significant gaps. Her rear bumper was repaired using insurance from... actually, Pauline says she's not sure any claim was ever formally filed against the city — \"I just figured I'd deal with it eventually, and now my back is still bothering me so I thought I'd call.\"",
    "nuance": "Liability, injury, and treatment all look solid — this would be a strong case against a private defendant. But the defendant is a CALIFORNIA city/government vehicle, and the criteria sets a 6-MONTH statute of limitations from the date of loss for CA government claims. At 7 months out, with no indication any government claim form was ever filed, this case is very likely already time-barred — no matter how good the underlying facts are.",
    "reason": "NOT QUALIFIED (blown government claim deadline). The CA 6-month government SOL has likely passed with no claim filed. Escalate only if Pauline can confirm some kind of formal government claim notice was submitted within that 6-month window — otherwise, this is likely dead regardless of liability strength."
  },
  {
    "id": "n6-5",
    "num": "6.5",
    "title": "City Work Truck, California, 5 Months Ago",
    "category": "Government Vehicle Cases",
    "disposition": "escalate",
    "story": "The caller is Pauline Esposito, the driver — right person. The accident happened approximately 5 months ago in California. Identical fact pattern: rear-ended by a city utility truck on duty, clear liability, consistent treatment since shortly after the accident, no claim filed against the city yet.",
    "nuance": "Same facts as 6.5, but one month earlier on the calendar. At 5 months, the CA 6-month government SOL clock is STILL RUNNING — but only barely. The danger here is a rep treating this like a normal-timeline intake (gather info, screen, route through the usual process) while a hard, short deadline quietly expires.",
    "reason": "ESCALATE URGENTLY — potentially qualified. The case is still inside the CA 6-month government SOL but with roughly one month of runway. This must be flagged and moved to the manager/attorney immediately so a government claim notice can be filed before the window closes — the strength of the underlying liability does not slow the clock."
  },
  {
    "id": "n7-1",
    "num": "7.1",
    "title": "USPS Mail Truck (Federal — Escalate, Not a Solo Rep Reject)",
    "category": "Federal Cases",
    "disposition": "escalate",
    "story": "The caller is Linda Park, the driver — right person. The accident happened 7 days ago around 1 PM. Linda was stopped at a red light on a residential street. A large white truck rear-ended her — Linda initially describes it only as \"a mail truck.\" When the rep asks for more detail, Linda confirms it was a standard USPS postal delivery truck, driver in USPS uniform, mid-route delivering mail. A police report documents the collision and notes the truck was \"a U.S. Postal Service vehicle, on duty.\" Linda has neck and shoulder pain; went to urgent care the next day and has been attending PT twice weekly since, no gaps. Rear bumper crumpled, trunk jammed shut. Linda got the supervisor's contact info. Linda's own insurance is active.",
    "nuance": "Every other element of this case is excellent — clear liability (rear-ended while stopped), prompt and consistent treatment, real property damage, a police report, and an identified responsible party with a supervisor's contact. The defendant being a USPS driver raises a federal defendant flag, and federal cases fall outside standard intake criteria. However, this determination is not a rep-level reject — the question of whether a federal tort claim can or should be pursued, referred out, or rejected entirely requires manager or attorney review. A rep who NQs this on their own and dismisses the caller is making a decision above their authority.",
    "reason": "ESCALATE. The defendant is a USPS driver — a federal entity — which is outside standard intake criteria. Do not NQ solo. Escalate to a manager or attorney to determine whether this should be referred to a firm handling federal tort claims (FTCA), rejected, or handled another way. The rep's job is to gather the facts and escalate, not to make the final call on federal cases."
  },
  {
    "id": "n7-2",
    "num": "7.2",
    "title": "\"A Mail Truck\" That's Actually Amazon (Commercial — Accepted)",
    "category": "Federal Cases",
    "disposition": "qualified",
    "story": "The caller is Devon Carter, the driver — right person. The accident happened 6 days ago around 3 PM. Devon was stopped at a red light. A large branded delivery van rear-ended him — Devon initially says, \"a delivery truck hit me.\" When the rep asks which company, Devon confirms it was an Amazon-branded delivery van (DSP contractor vehicle), driver actively making deliveries on his route at the time. Police responded and cited the Amazon driver for following too closely. Devon got the driver's information along with the delivery service company's name (an Amazon Delivery Service Partner) — the vehicle is commercially insured. Devon has neck and mid-back pain; ER that evening (CT negative for fracture), chiropractic care starting 3 days later, twice weekly, no gaps. Rear bumper severely caved, rear window cracked. Devon's own policy is active.",
    "nuance": "Devon used the vague phrase \"delivery truck\" — the same kind of phrase that, had it turned out to be USPS, would kill the case. The rep's follow-up question (which company?) is what determines everything. Amazon (along with UPS, FedEx, Uber, Lyft, DoorDash, Instacart, and Shipt) is explicitly listed as a commercial entity on the criteria's commercial list — the opposite outcome from USPS despite the surface-level similarity.",
    "reason": "QUALIFIED. The defendant was an Amazon delivery driver (commercial, not federal/government), cited by police for the rear-end. Commercial insurance is available through the delivery service partner. Devon's own policy active (Prop 213 satisfied). Injury (ER, CT scan) and consistent treatment within 30 days confirmed. Flag and prioritize per the criteria's emphasis on commercial cases."
  },
  {
    "id": "n7-3",
    "num": "7.3",
    "title": "USPS Contractor in an Unmarked Personal Vehicle",
    "category": "Federal Cases",
    "disposition": "escalate",
    "story": "The caller is Ramona Castillo, the driver — right person. The accident happened 8 days ago around noon, on a rural road. Ramona was rear-ended by an unmarked Subaru wagon — no branding, no markings of any kind. No police were called; the driver, an older man, exchanged insurance info (his personal policy, State Farm, confirmed active) and seemed apologetic. In conversation, he mentioned he was \"out doing my route\" — when Ramona asked what he meant, he explained he's a rural contract mail carrier, delivering mail for USPS using his own personal vehicle, and was actively on his delivery route at the time of the accident. Ramona has neck pain, started chiropractic care within the week, no gaps.",
    "nuance": "\"It wasn't a postal truck\" doesn't end the federal question here — the FUNCTION is the trap, not the vehicle's appearance. The driver was working for the postal service (as a rural contract carrier) at the time of the accident, even though the vehicle was his own unmarked personal car with his own personal insurance. The criteria's language is \"def was driving for postal service\" — which describes this situation exactly, despite the unmarked vehicle.",
    "reason": "ESCALATE, leaning NOT QUALIFIED. The defendant was driving for the postal service at the time of the accident, which the criteria treats as a federal case regardless of the vehicle being unmarked and personally owned/insured. This should be confirmed with the manager, but the working relationship to USPS — not the vehicle's appearance — is the controlling fact."
  },
  {
    "id": "n8-1",
    "num": "8.1",
    "title": "Bus Passenger, Clear Liability vs. a Regular Car",
    "category": "Bus Cases",
    "disposition": "qualified",
    "story": "The caller is Theresa Allen, who was riding as a passenger on a city transit bus — right person. The accident happened 5 days ago around noon. Theresa was seated on the bus, which was traveling through a green light, when a sedan ran the red light from the cross street and struck the front right side of the bus. The impact threw Theresa forward into the seat in front of her. A police report cites the sedan driver for running the red light. The bus sustained front-end damage; Theresa's injuries are a bruised sternum and a sprained wrist from bracing against the seat. She went to urgent care that same afternoon and has been wearing a wrist brace, with a follow-up scheduled with an orthopedist. The sedan driver has Progressive, confirmed active. Theresa's own auto policy (she owns a car, though wasn't driving it) is active.",
    "nuance": "The word \"bus\" tends to make reps reach for the 6-month government-claim clock and the major-injury requirement — both of which apply to claims AGAINST the bus/transit agency. But here, the bus was not at fault and is not the defendant. The at-fault party is the SEDAN driver, a private citizen with private insurance, cited by police. This is a Bus vs Auto situation where our PC (the bus passenger) pursues the regular vehicle's insurance — the government rules simply don't attach.",
    "reason": "QUALIFIED. The criteria allows signing when a bus passenger is injured by a defendant in a regular vehicle with clear liability — here the sedan driver was cited for running a red light. The claim runs against the sedan's private insurance, not the transit agency, so the 6-month government SOL and major-injury requirement for bus-as-defendant claims do not apply. Injury and same-day treatment confirmed."
  },
  {
    "id": "n8-2",
    "num": "8.2",
    "title": "PC's Own Car Hit by a Bus, Bus Driver at Fault, Soft Tissue",
    "category": "Bus Cases",
    "disposition": "qualified",
    "story": "The caller is Howard Lee, the driver — right person. The accident happened 9 days ago. Howard was driving his own car when a city transit bus, attempting to merge back into traffic from a bus stop, sideswiped the front of Howard's car. A report was generated and, per Howard, \"the bus driver admitted he didn't check his mirror before pulling out — it's pretty clearly on him.\" Howard has neck and back soreness; saw a chiropractor within the week, treating twice weekly. Front fender and mirror damaged.",
    "nuance": "This is Auto vs Bus — Howard's own vehicle was struck by the bus while merging out of a stop, and the bus driver admitted fault. Transit agencies (or their contracted operators) carry commercial liability coverage on their vehicles just like any other fleet — this is a standard third-party liability claim against that policy, not a claim that requires clearing a major-injury bar. Howard's soft-tissue treatment, started promptly and ongoing, meets the standard 30-day requirement.",
    "reason": "QUALIFIED. Clear liability — the bus driver admitted fault for failing to check before merging out of the stop, documented in the report. The transit agency's commercial liability coverage is the insurance to pursue. Injury (neck and back soreness) and treatment within 30 days, ongoing chiropractic care, are confirmed."
  },
  {
    "id": "n8-3",
    "num": "8.3",
    "title": "Bus Passenger Thrown by Hard Braking, Fractured Wrist, No Collision",
    "category": "Bus Cases",
    "disposition": "escalate",
    "story": "The caller is Patrice Nwosu, who was riding as a passenger on a city bus — right person. The accident happened 7 days ago. Patrice describes: \"There was no crash or anything — the bus driver just slammed the brakes really hard, out of nowhere, and I went flying into the pole/handle in front of me. I wasn't holding on because I'd just stood up to get ready for my stop.\" Patrice's wrist was fractured in the fall — confirmed by X-ray at the ER that same day, placed in a cast, with an orthopedic follow-up scheduled. No other vehicle was involved; the bus itself was undamaged.",
    "nuance": "No collision occurred at all — just hard braking causing Patrice to be thrown. Reps might assume \"no collision\" means \"no case\" by default. But the criteria carves out a specific path for Passenger vs Bus Driver negligence (hard braking, sudden acceleration) WITHOUT any collision — provided the injury is major to catastrophic. A confirmed fracture is the kind of injury that can clear that bar; soreness would not.",
    "reason": "ESCALATE / potentially QUALIFIED. Criteria: driver-negligence bus cases with no collision must be major injury to catastrophic to consider. A confirmed wrist fracture may clear that threshold — document fully (X-ray, casting, orthopedic referral) and route for attorney approval, since this category requires it even when injury severity supports it."
  },
  {
    "id": "n8-4",
    "num": "8.4",
    "title": "Bus Passenger Thrown by Hard Braking, Soreness Only, No Collision",
    "category": "Bus Cases",
    "disposition": "not_qualified",
    "story": "The caller is Diane Sutter, who was riding as a passenger on a city bus — right person. The accident happened 6 days ago. Diane describes an identical scenario to 8.4: the bus driver braked hard with no collision, and Diane, standing and not holding on, was thrown forward into a pole. She did not fall to the ground but jolted hard against the pole with her shoulder and neck. Diane has neck soreness and a sore shoulder; she saw urgent care 4 days later, was told it's a mild strain/contusion, and given OTC pain relief with no further appointments scheduled.",
    "nuance": "Identical mechanism to 8.4 — hard braking, no collision, passenger thrown into a pole — but the injury here is mild soreness/contusion rather than a confirmed fracture. The no-collision Passenger vs Bus Driver negligence path exists ONLY for major-to-catastrophic injuries; soreness and a contusion treated with OTC medication sits well below that threshold.",
    "reason": "NOT QUALIFIED. Soft-tissue soreness/contusion from hard braking with no collision does not meet the major-to-catastrophic injury threshold the criteria requires for Passenger vs Bus Driver negligence cases without a collision."
  },
  {
    "id": "n9-1",
    "num": "9.1",
    "title": "Passenger, Third-Party Defendant at Fault, Own Driver Blameless",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "qualified",
    "story": "The caller is Natasha Webb, who was a passenger — right person (calling about her own injuries). The accident happened 8 days ago. Natasha was riding in her cousin's car as a passenger. Her cousin was driving normally, stopped at a red light, when a car ran the cross-street red and T-boned the passenger side of her cousin's car — directly where Natasha was sitting. Police cited the other driver for running the red light; that driver's insurance (Allstate) is confirmed active. Natasha's cousin was not cited and did nothing wrong. Natasha has a fractured collarbone, confirmed by X-ray at the ER, in a sling with an orthopedic follow-up scheduled. Door and side panel of the cousin's car are caved in.",
    "nuance": "This is the cleanest version of Passenger vs Auto: the passenger's own driver (the cousin) did nothing wrong and is not at fault — the facts indicate the at-fault party is entirely the third-party defendant. The claim simply targets that defendant's insurance.",
    "reason": "QUALIFIED. Natasha's own driver is not at fault; the third-party defendant was cited and has active insurance. Passengers are no-fault, and this claim proceeds against the at-fault third party's policy. Injury (fractured collarbone) and same-day ER treatment confirmed."
  },
  {
    "id": "n9-2",
    "num": "9.2",
    "title": "Passenger, Own Driver (Non-Household Friend) at Fault",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "qualified",
    "story": "The caller is Brianna Cole, who was a passenger — right person. The accident happened 8 days ago around 9 PM. Brianna was riding home from dinner in her friend Kayla's car. Kayla, while merging onto the freeway, misjudged the gap and sideswiped a pickup truck already established in the lane. The police report cites Kayla for an unsafe lane change; the pickup driver was not cited. Kayla has Liberty Mutual, confirmed active and accepting the claim. Brianna suffered a sprained wrist (braced against the door) and neck soreness; went to urgent care the next day, doing at-home PT with one follow-up so far. When asked about her relationship to Kayla and living situation, Brianna says, \"We're just friends — she lives across town, I have my own apartment.\"",
    "nuance": "Reps who over-learn the household exception start rejecting ALL passenger-vs-own-driver cases. The criteria says we can typically pursue these against the driver's insurance — the exceptions are ONLY spouse, minor child, and person you live with. Kayla, a friend living separately, is none of those.",
    "reason": "QUALIFIED. Brianna is a no-fault passenger; her driver (Kayla) was cited and is at fault, with active insurance. None of the relationship exceptions apply — Kayla is a friend living separately. Claim proceeds against Kayla's insurance. Injury and treatment within 30 days confirmed."
  },
  {
    "id": "n9-3",
    "num": "9.3",
    "title": "Passenger, Own Driver (Spouse) at Fault",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "not_qualified",
    "story": "The caller is Renata Hughes, who was a passenger — right person. The accident happened 9 days ago. Renata was riding in the front passenger seat of her husband's car. Her husband, while changing lanes on the freeway, didn't fully check his blind spot and sideswiped a car traveling in the next lane. The police report cites Renata's husband for an unsafe lane change; the other driver was not cited. The other driver has insurance, confirmed active, and Renata's husband also has full coverage on his own policy. Renata went to the ER the same night with neck and lower back pain and headaches, and started chiropractic care 5 days later, attending three sessions so far. Renata confirms she and her husband live together — they've been married for six years.",
    "nuance": "Passenger, not driving, not cited, genuinely injured, treated promptly, insurance exists on both vehicles — every surface signal says \"qualify this.\" The fact that flips it: the at-fault driver is Renata's HUSBAND, and they live together. Spouse is the most explicit of the three household exceptions.",
    "reason": "NOT QUALIFIED. Although Renata is a no-fault passenger with real injuries and timely treatment, the at-fault driver (her husband) is her spouse. The criteria explicitly bars passenger claims against the at-fault driver's own insurance when the driver is the PC's spouse. The other driver was not cited, so there is no alternative at-fault party to pursue."
  },
  {
    "id": "n9-4",
    "num": "9.4",
    "title": "Passenger, Own Driver (Live-In Fiancé, Cohabiting) at Fault",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "not_qualified",
    "story": "The caller is Jasmine Reed, who was a passenger — right person. The accident happened 12 days ago around 7 PM. Jasmine was in the front passenger seat of her fiancé's car on the freeway. Her fiancé attempted to change lanes, didn't fully check his blind spot, and sideswiped a car in the next lane. The police report cites Jasmine's fiancé for an unsafe lane change; the other driver was not cited. The other driver has active insurance, and Jasmine's fiancé also has full coverage. Jasmine went to the ER the same night with neck and lower back pain, headaches, and started chiropractic care 5 days later, attending three sessions. Jasmine confirms she and her fiancé have lived together for the past year and a half, sharing a one-bedroom apartment.",
    "nuance": "Same setup as 9.3 but with a fiancé instead of a husband — \"not married, so the spouse rule doesn't apply\" is true but irrelevant. The third exception is PERSON YOU LIVE WITH, and cohabitation alone triggers it, regardless of marital status.",
    "reason": "NOT QUALIFIED. The at-fault driver is a person Jasmine lives with — squarely inside the household exception regardless of marital status. The other driver was not cited, so there's no alternative defendant."
  },
  {
    "id": "n9-5",
    "num": "9.5",
    "title": "Passenger, Own Driver (Fiancé, Separate Residences) at Fault",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "qualified",
    "story": "The caller is Courtney Diaz, who was a passenger — right person. The accident happened 10 days ago. Courtney was riding with her fiancé when he rear-ended a car that had stopped short ahead of him — he was cited for following too closely. The car he hit has active insurance, and Courtney's fiancé also has his own active policy. Courtney has neck soreness, started chiropractic care 4 days later. When the rep asks about their living situation, Courtney says, \"We're engaged, but he actually still lives with his parents about 40 minutes away — we're saving up before we move in together. I have my own place.\"",
    "nuance": "Same relationship label (fiancé) as 9.4, but the deciding fact — cohabitation — is reversed. Fiancé alone is not on the exception list (spouse / minor child / person you live with); without cohabitation, none of the three exceptions apply to Courtney's fiancé.",
    "reason": "QUALIFIED. Courtney and her fiancé maintain genuinely separate residences — none of the household exceptions apply. Her fiancé was cited and at fault, with active insurance. Injury and treatment within 30 days confirmed."
  },
  {
    "id": "n9-6",
    "num": "9.6",
    "title": "Passenger, Own Driver (Adult Child Living at Home) at Fault",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "not_qualified",
    "story": "The caller is Deborah Ainsley, who was a passenger — right person. The accident happened 7 days ago. Deborah was riding with her 24-year-old son, who was driving. He ran a stop sign and was T-boned by cross traffic — he was cited for failing to stop. The cross-traffic driver was not cited and has active insurance, but per the report, Deborah's son is the at-fault party. Deborah has bruised ribs and neck pain; saw urgent care the next day, one follow-up scheduled. When asked about living arrangements, Deborah confirms her son lives with her — \"he's 24 but still at home, saving up for his own place.\"",
    "nuance": "Reps check the \"minor child\" box, see he's 24, and clear it — missing that the THIRD exception (person you live with) still catches him. Age and address are two separate checks, and this son fails the second one even though he clears the first.",
    "reason": "NOT QUALIFIED. The at-fault driver is a household member (Deborah's adult son, living with her). \"Minor child\" not applying does not matter when \"person you live with\" does."
  },
  {
    "id": "n9-7",
    "num": "9.7",
    "title": "Passenger, Own Driver (Adult Child Living Elsewhere) at Fault",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "qualified",
    "story": "The caller is Margaret Soto, who was a passenger — right person. The accident happened 8 days ago. Margaret was riding with her 26-year-old son, who ran a stop sign and was struck by cross traffic — he was cited. The other driver has active insurance, but the son is the at-fault party per the citation. Margaret has neck soreness, treated within the week. When asked about living arrangements, Margaret says, \"Oh no, he moved out years ago, he has his own apartment across the city — I was just visiting him and we were heading out to lunch.\"",
    "nuance": "Same fact pattern as 9.6 — adult child driving, at fault, cited — but here the son lives independently. Adult, non-household child is not on the exception list at all (spouse / minor child / person you live with) — none apply.",
    "reason": "QUALIFIED. None of the three household exceptions (spouse, minor child, person you live with) applies to Margaret's adult son, who lives independently. The claim proceeds against her son's insurance as the at-fault driver. Injury and treatment within 30 days confirmed."
  },
  {
    "id": "n9-8",
    "num": "9.8",
    "title": "Passenger, Own Driver (Roommate) at Fault",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "not_qualified",
    "story": "The caller is Trevor Pham, who was a passenger — right person. The accident happened 6 days ago. Trevor was riding with his roommate, who was driving. The roommate, attempting to parallel park, backed into a car behind them with enough force to also jolt Trevor against his seatbelt — the roommate was cited for an unsafe backing maneuver. The struck car's driver was not cited and has active insurance, but the roommate is the at-fault party. Trevor has neck and shoulder pain; saw a chiropractor within the week. Trevor confirms he and his roommate share an apartment — \"we've lived together for about two years, just splitting rent, nothing romantic or anything.\"",
    "nuance": "No romance, no family relation — reps may assume the exceptions are about relationships specifically (spouse, family). They're about the HOUSEHOLD. A roommate, regardless of the nature of the relationship, is literally a \"person you live with.\"",
    "reason": "NOT QUALIFIED. The at-fault driver (Trevor's roommate) is a person he lives with — the household exception applies regardless of the platonic, non-family nature of the relationship."
  },
  {
    "id": "n9-9",
    "num": "9.9",
    "title": "Passenger Riding With a Spouse Who Is NOT at Fault",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "qualified",
    "story": "The caller is Renata Hughes, who was a passenger — right person. The accident happened 7 days ago. Renata was riding in her husband's car. He was driving normally, stopped at a red light, when a car ran the cross-street red and T-boned the passenger side directly where Renata was sitting. Police cited the OTHER driver for running the red light; that driver's insurance (Geico) is confirmed active. Renata's husband was not cited and did nothing wrong. Renata has a fractured wrist, confirmed by X-ray, casted, with an orthopedic follow-up. Passenger door and side panel of her husband's car are caved in.",
    "nuance": "Reps who hear \"husband was driving\" and flinch — primed by scenarios like 9.3 — are over-applying the household rule. The exception only matters when the household member IS THE AT-FAULT PARTY. Here, the husband did nothing wrong; the at-fault party is the third-party red-light runner. The relationship between Renata and her driver is simply irrelevant to this claim.",
    "reason": "QUALIFIED. This is a standard Passenger vs Auto claim against the third-party defendant's insurance (cited for running the red light). The spousal relationship between Renata and her (not-at-fault) driver does not trigger any exception, because the spouse is not the defendant. Injury (fractured wrist) and same-day treatment confirmed."
  },
  {
    "id": "n9-10",
    "num": "9.10",
    "title": "Two Passengers in the Same At-Fault Car: Wife and Coworker",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "conditional",
    "story": "The caller is Lawrence Pruitt, calling about an accident that happened 8 days ago — Lawrence was driving, and he caused the accident (rear-ended a car ahead after following too closely, cited by police). Lawrence's wife, Donna, was in the front passenger seat, and his coworker, Marcus, was in the back seat — they'd all been carpooling home from a work event. Both Donna and Marcus were injured: Donna has a sprained wrist, Marcus has neck pain — both treated within the week at urgent care. Lawrence has full coverage, confirmed active. Lawrence asks the rep, \"Can you guys help all three of us? We're all hurt.\"",
    "nuance": "One accident, one phone call, but THREE different people with potentially different dispositions, each needing to be screened individually against the household-exception list. Donna is Lawrence's wife (household exception applies to her). Marcus is a coworker with no household connection to Lawrence (no exception applies to him). And Lawrence himself is the at-fault driver.",
    "reason": "SPLIT disposition. Marcus (coworker passenger) is QUALIFIED — no household exception applies, claim proceeds against Lawrence's insurance. Donna (wife/passenger) is NOT QUALIFIED — spouse exception bars a claim against her own household's policy. Lawrence (the at-fault driver) is NOT QUALIFIED — we do not represent the at-fault driver. Screen and disposition each person separately; never blanket the call."
  },
  {
    "id": "n9-11",
    "num": "9.11",
    "title": "The At-Fault Driver Asks to Be Represented Too",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "not_qualified",
    "story": "The caller is Oscar Mendez, who caused an accident 6 days ago — Oscar admits he was looking at his GPS and rear-ended a car ahead of him at a light, and was cited for following too closely. The other driver's insurance is active. Oscar's own car has front-end damage and Oscar himself has neck pain, treated at urgent care. Oscar's brother, a passenger in Oscar's car, also has minor bruising and is asking about his own claim. Oscar says, \"I got hurt worse than my brother honestly — can you guys represent both of us, since it's all the same accident?\"",
    "nuance": "Oscar's brother, as a passenger, can potentially be screened for a claim against Oscar's insurance (subject to the household exception, if Oscar and his brother live together). But Oscar himself — the driver who caused the accident — cannot be represented for his own injuries, no matter how the call is framed or how \"it's all one accident\" makes it feel like a package deal.",
    "reason": "NOT QUALIFIED for Oscar (the at-fault driver) — the criteria states we will not be able to represent the driver since they are at fault. Oscar's brother should be screened individually: if they live together, the household exception likely bars a claim against Oscar's policy; if they live separately, the brother's passenger claim may proceed against Oscar's insurance."
  },
  {
    "id": "n9-12",
    "num": "9.12",
    "title": "Passenger, Own Driver at Fault, But a Third Driver May Share Fault",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "escalate",
    "story": "The caller is Stephanie Burke, who was a passenger — right person. The accident happened 9 days ago. Stephanie's husband was driving; he sideswiped a car while changing lanes and was cited for an unsafe lane change. But Stephanie adds: \"Honestly, the car he hit was going crazy fast right before — I think they were swerving in and out of lanes right before my husband even started changing lanes. There was actually a guy in the car behind us who saw the whole thing and gave his number to the officer.\" The struck car's driver was not cited. Stephanie has neck pain, treating within the week. Stephanie and her husband live together.",
    "nuance": "The spousal exception blocks any claim against Stephanie's HUSBAND's policy — that part is settled. But Stephanie has also described a THIRD vehicle whose driving (speeding, weaving) may have contributed, AND there's an independent witness (unrelated to either driver) who gave a statement to police. If that evidence actually establishes some fault on the third driver, a Passenger vs Auto claim against THAT driver's insurance is a separate, viable path — distinct from the barred claim against the husband.",
    "reason": "ESCALATE if the independent witness statement actually supports fault on the third driver — that would open a Passenger vs Auto path against the third driver's insurance, a path the household exception does not block. If, on review, the witness statement does NOT support any fault on the third driver, then this is NOT QUALIFIED (spousal exception bars the only at-fault party). The rep's job is to get the independent witness's statement documented, not to assume either outcome."
  },
  {
    "id": "n9-13",
    "num": "9.13",
    "title": "Minor Passenger, California, Uninjured, Injured Adult Signing",
    "category": "Passenger Cases & Relationship Exceptions",
    "disposition": "qualified",
    "story": "The caller is Yolanda Ramirez, calling about an accident involving herself and her family — right person (injured adult signing). The accident happened 9 days ago in Sacramento, California. Yolanda was driving her family home — herself, her husband (front passenger), and their 8-year-old daughter (back seat, booster seat). Stopped at a red light, a pickup truck rear-ended them at moderate speed. Police cited the pickup driver for failing to stop in time; his insurance (Travelers) is active. Yolanda's car has significant rear-end damage. Yolanda suffered a neck strain, went to urgent care the next day, chiropractic care starting 4 days after. Her husband has lower back pain and is treating alongside her. When asked about the daughter, Yolanda says, \"She seemed totally fine — no bruises, didn't complain about anything, we took her to her pediatrician two days later just to be safe and they said she's completely fine, no injuries at all.\" Both adults' policies are active.",
    "nuance": "A rep moving quickly might focus only on the two injured adults and never ask about the child — or, hearing \"she's fine, no injuries,\" assume that means she's not part of the intake. The criteria for California (and Nevada) explicitly states the opposite: ALL minors in the plaintiff's vehicle are accepted REGARDLESS OF INJURY, as long as at least one injured adult from that vehicle is signing.",
    "reason": "QUALIFIED — for all three. Yolanda and her husband meet standard auto criteria (rear-ended, cited defendant, active insurance, injury/treatment within 30 days). The 8-year-old daughter, despite no injuries, is included per the California rule for minors in the plaintiff's vehicle when an injured adult is signing."
  },
  {
    "id": "n10-1",
    "num": "10.1",
    "title": "Semi Truck Rear-End (Prioritize)",
    "category": "Commercial & Rideshare Cases",
    "disposition": "qualified",
    "story": "The caller is Anthony Russo, the driver — right person. The accident happened 5 days ago on the freeway. Anthony was in slow-moving traffic when a semi truck rear-ended him, pushing his car forward several feet. The truck driver was cited for following too closely; the trucking company carries commercial insurance, confirmed active. Anthony's rear end is severely damaged — bumper, trunk, and rear window all affected. He went to the ER that night (no fractures) and started PT 4 days later, no gaps. Anthony's own policy is active.",
    "nuance": "Auto vs Semi follows the same rules as every other traffic accident — clear liability, cited defendant, active insurance, injury and treatment within 30 days. The nuance here is urgency, not eligibility: the criteria stresses being very diligent in identifying these and signing ASAP once they meet criteria.",
    "reason": "QUALIFIED — and prioritize. All standard criteria met (cited rear-end, active commercial insurance, injury/treatment within 30 days, Anthony's own policy active). Slow-walking a qualified semi case is itself the failure mode the criteria warns against."
  },
  {
    "id": "n10-2",
    "num": "10.2",
    "title": "Uber Passenger, Collision With a Defendant Vehicle",
    "category": "Commercial & Rideshare Cases",
    "disposition": "qualified",
    "story": "The caller is Felix Ortega, who was a passenger in an Uber — right person. The accident happened 6 days ago. Felix was in the back seat heading to the airport when another car ran a red light and collided with the Uber's front passenger side. Police cited the other driver for running the red light; that driver's insurance (Geico) is confirmed active. Felix has neck and shoulder pain, went to urgent care the next day, started PT, no gaps.",
    "nuance": "This is the criteria's straightforward qualifying pattern for Uber/Lyft passengers — an actual collision with a cited, insured defendant. No ambiguity about \"was there a collision\" here.",
    "reason": "QUALIFIED. Criteria: for Uber/Lyft passengers, we can sign provided there's a collision with a defendant or a solo car accident — here, a cited defendant collided with the Uber. Injury and treatment within 30 days confirmed."
  },
  {
    "id": "n10-3",
    "num": "10.3",
    "title": "Uber Passenger, Solo Crash Into a Median",
    "category": "Commercial & Rideshare Cases",
    "disposition": "qualified",
    "story": "The caller is Felix Ortega, who was a passenger in a rideshare vehicle — right person. The incident happened 6 days ago around midnight. Felix was in the back seat of a Lyft heading home. The driver, who appeared tired, drifted out of the lane on a curving road and the front right side of the car struck a raised concrete median, jolting hard and stopping against the curb. No other vehicles were involved. Felix hit his head on the window and felt immediate neck pain. The driver reported it through the app; police documented the single-vehicle collision (tire blown, rim bent, bumper cracked). Felix went to the ER (CT clear), diagnosed with cervical strain, started PT twice weekly, no gaps.",
    "nuance": "There's no \"other car\" in this story — a rep scanning for \"who hit the Lyft\" comes up empty and may assume that means no qualifying collision. But the criteria's Uber/Lyft requirement is collision with a defendant OR a solo car accident — striking the median with enough force to blow a tire and bend a rim is squarely a solo car accident.",
    "reason": "QUALIFIED. A solo car accident (striking the median) satisfies the Uber/Lyft passenger collision requirement, even with no second vehicle. Injury (concussion workup, cervical strain) and treatment (ER same night, ongoing PT no gaps) confirmed, documented by police and the app."
  },
  {
    "id": "n10-4",
    "num": "10.4",
    "title": "Uber Passenger, Hard Brake, No Collision",
    "category": "Commercial & Rideshare Cases",
    "disposition": "not_qualified",
    "story": "The caller is Wendy Lau, who was a passenger in a rideshare vehicle — right person. The incident happened 4 days ago around 9 PM. Wendy was in the back seat of an Uber on her way home from the airport. Another car cut in front without signaling; the Uber driver slammed on the brakes to avoid a collision. Wendy, not wearing her seatbelt, was thrown forward, hitting the back of the front seat with her shoulder, neck snapping forward. The Uber did NOT make contact with the other car, did not hit anything, and remained under control — they pulled over briefly, then continued. Wendy reported it to Uber through the app. She went to urgent care two days later for neck/shoulder pain, soft tissue strain, one follow-up scheduled.",
    "nuance": "Real, documented injury, treated within the window, reported to Uber — \"Uber has big insurance\" is the thought a rep might have. But the criteria's Uber/Lyft passenger requirement is binary: there has to be a collision — with a defendant vehicle, or a solo crash into an object. Here, nothing was struck.",
    "reason": "NOT QUALIFIED. No collision occurred — the Uber did not strike another vehicle, and there was no solo-car accident. The criteria requires a collision for Uber/Lyft passenger cases; hard braking alone, even with a real injury, does not meet that requirement."
  },
  {
    "id": "n10-5",
    "num": "10.5",
    "title": "Uber Driver (Not Passenger), Rear-Ended While On a Trip",
    "category": "Commercial & Rideshare Cases",
    "disposition": "qualified",
    "story": "The caller is Marcus Webb, an Uber driver — right person, calling about his own injury. The accident happened 6 days ago. Marcus was driving a passenger to their destination when a car rear-ended his vehicle at a light. Police cited the other driver for following too closely; that driver's insurance (Progressive) is active. Marcus has neck pain, started chiropractic care within the week, no gaps. His own personal auto policy is active, and he separately carries rideshare-specific coverage through the Uber platform for when he's on a trip.",
    "nuance": "The Uber/Lyft \"needs a collision\" rule governs PASSENGER claims. Marcus here is the DRIVER, not a passenger — he's simply a not-at-fault rear-end plaintiff, like any other driver. The rideshare context matters for noting which insurance layers apply (personal vs. rideshare-period commercial coverage), but it does not change the basic screening.",
    "reason": "QUALIFIED. Marcus is a standard not-at-fault rear-end plaintiff (cited defendant, active insurance, injury/treatment within 30 days, his own policy active). Note his on-trip/rideshare-driver status for the attorney, since it may affect which insurance layer (his personal policy, the at-fault driver's policy, or Uber's contingent coverage) is primary — but it does not change qualification."
  },
  {
    "id": "n10-6",
    "num": "10.6",
    "title": "Personal Car, Driver Working for DoorDash",
    "category": "Commercial & Rideshare Cases",
    "disposition": "qualified",
    "story": "The caller is Priya Anand, the driver — right person. The accident happened 7 days ago. Priya was stopped at a stop sign when a Honda Civic ran the sign and struck the side of her car. Police cited the Civic's driver for failing to stop. In conversation, the driver mentioned to Priya that he was \"in the middle of a delivery\" — when Priya asked, he confirmed he was actively working for DoorDash at the time, using his personal car. He gave Priya his personal insurance info (Geico, active). Priya has neck pain, treated within the week.",
    "nuance": "The personal car disguises a commercial case. DoorDash, Instacart, Shipt, Uber, Lyft, and Amazon drivers are all on the criteria's commercial list — but the rep only learns the work status by asking. This affects categorization/prioritization and may open additional commercial coverage layers for the attorney to pursue.",
    "reason": "QUALIFIED — and flag as commercial. Standard criteria met (cited defendant, active insurance, injury/treatment within 30 days, Priya's own policy active). The DoorDash work status should be documented for the attorney, since commercial/platform insurance may apply in addition to the driver's personal policy."
  },
  {
    "id": "n10-7",
    "num": "10.7",
    "title": "Unmarked Company Pickup Truck",
    "category": "Commercial & Rideshare Cases",
    "disposition": "qualified",
    "story": "The caller is Caleb Strand, the driver — right person. The accident happened 5 days ago. Caleb was stopped at a light when an unmarked white pickup truck, loaded with ladders and tools in the bed, rear-ended him. The driver, a plumber, was cited for following too closely. He gave Caleb his personal insurance info (Farmers, active) and mentioned he was \"driving between job sites\" at the time — the truck itself belongs to his employer, a plumbing company, though the insurance card he provided was his own personal policy. Caleb has neck pain, treated within the week.",
    "nuance": "Many commercial vehicles carry no branding at all. \"Was the driver working at the time, and whose vehicle is it?\" is the only way a business policy comes into view — here, the truck is company-owned even though the insurance card handed over was personal. This doesn't change the basic qualification, but it flags an additional potential coverage layer (the employer's commercial auto policy) for the attorney.",
    "reason": "QUALIFIED — flag as a commercial/company-vehicle case for prioritization. Standard criteria met (cited defendant, at least one active insurance policy confirmed, injury/treatment within 30 days, Caleb's own policy active). Document that the vehicle is company-owned, used for work travel, in case the employer's commercial policy is the more appropriate target."
  },
  {
    "id": "n11-1",
    "num": "11.1",
    "title": "Pedestrian Struck in Crosswalk, Clean Liability",
    "category": "Pedestrian & Bicyclist Cases",
    "disposition": "qualified",
    "story": "The caller is Hector Villanueva, the pedestrian — right person. The accident happened 6 days ago. Hector was crossing in a marked crosswalk with the pedestrian signal in his favor when a car making a right turn failed to yield and struck him, knocking him down. Police cited the driver for failing to yield to a pedestrian in a crosswalk; the driver's insurance (State Farm) is active. Hector suffered a sprained ankle and bruised hip; he went to urgent care the same day and has a follow-up scheduled.",
    "nuance": "This is the cleanest pedestrian case type — clear citation, active insurance, same-day treatment. The rep's job is simply to confirm the standard elements rather than overthink it; pedestrian cases are broader than this (see 11.2), but this one doesn't even need the broader rule.",
    "reason": "QUALIFIED. Driver cited for failing to yield to a pedestrian in a crosswalk, active insurance, same-day treatment for real injuries (sprain, bruising). All standard criteria met."
  },
  {
    "id": "n11-2",
    "num": "11.2",
    "title": "Pedestrian Jaywalking, At Fault Per Police Report",
    "category": "Pedestrian & Bicyclist Cases",
    "disposition": "qualified",
    "story": "The caller is Gerald Thompson, the pedestrian — right person. The accident happened 4 days ago around 9 PM. Gerald was crossing a four-lane road mid-block, not at a crosswalk or intersection, walking from a bar to his apartment. A car in the right lane struck him, knocking him to the pavement. The driver stopped immediately and called 911. Police documented that Gerald was crossing outside a marked crosswalk in violation of pedestrian right-of-way rules — effectively assigning Gerald fault for the manner of crossing. The driver was not cited. The driver has GEICO insurance, confirmed active. Gerald suffered a fractured ankle and road rash; transported by ambulance to the ER, X-ray confirmed the fracture, placed in a walking boot, orthopedic follow-up scheduled within 30 days. Gerald has never had an attorney for this.",
    "nuance": "The police report assigns fault to Gerald for jaywalking — in a normal auto vs auto case, a PC found at fault would be an automatic reject. But pedestrian (and bicyclist) cases are explicitly carved out from the fault requirement: the criteria says we take ALL ped vs auto cases REGARDLESS OF FAULT, with only narrow exceptions (case too old/near SOL, prior attorney, no treatment). None apply here.",
    "reason": "QUALIFIED. Pedestrian vs auto cases are taken regardless of fault. Gerald has no prior attorney, the case is fresh (4 days, nowhere near any SOL), defendant insurance is active, and he was injured (fractured ankle) and treated immediately (ambulance, ER, ongoing orthopedic follow-up)."
  },
  {
    "id": "n11-3",
    "num": "11.3",
    "title": "Pedestrian, Fractured Leg, Big-Injury Gap Exception",
    "category": "Pedestrian & Bicyclist Cases",
    "disposition": "escalate",
    "story": "The caller is Imani Carter, the pedestrian — right person. The accident happened about 3 months ago. Imani was struck by a car while crossing — the criteria's \"regardless of fault\" rule applies, and the driver's insurance (Farmers) is active. Imani suffered a fractured leg, confirmed by X-ray, and underwent surgery shortly after. She did the initial post-surgical follow-ups for about a month, then had a roughly 6-week gap in treatment — \"I couldn't get to appointments, I don't have a car and my sister, who'd been driving me, moved out of state.\" Imani has since resumed physical therapy and is actively treating again.",
    "nuance": "A 6-week gap normally kills a case — but the ped/bicyclist criteria has a built-in escape hatch the general gap rule doesn't: with a BIG injury (here, a surgical leg fracture), we may make an exception, gathering all case and treatment info and asking the attorneys for approval. The same gap with soft-tissue injuries would simply be NOT QUALIFIED.",
    "reason": "ESCALATE to attorneys for the big-injury gap exception. Document the surgery, the full treatment timeline including the gap, the documented reason for the gap (lack of transportation), and that treatment has resumed — then route for attorney approval."
  },
  {
    "id": "n11-4",
    "num": "11.4",
    "title": "Pedestrian, Over a Year Old",
    "category": "Pedestrian & Bicyclist Cases",
    "disposition": "escalate",
    "story": "The caller is Theodore Banks, the pedestrian — right person. The accident happened approximately 14 months ago. Theodore was struck while crossing the street; the driver's insurance information was obtained at the scene (Mercury). Theodore suffered serious injuries — a fractured pelvis requiring an extended hospital stay — and has had sporadic treatment since, including a few months where he didn't see anyone due to the cost of follow-up visits. He has never had an attorney for this and is calling now because the pain has worsened recently.",
    "nuance": "Severe injury, identified insurance, no prior attorney — on the surface, promising. But the case is over a year old, which the criteria flags as its own category requiring a specific process rather than a simple yes/no: refer to the Over A Year Old Guide Sheet, gather as much information as possible, and get attorney confirmation, always CC'ing Intake.",
    "reason": "ESCALATE per the over-a-year-old process. The disposition is a procedure, not a rep-level call: gather full details (injury severity, treatment history including gaps, insurance info, any prior attorney contact), consult the Over A Year Old Guide Sheet, and route to the attorneys for confirmation with Intake CC'd."
  },
  {
    "id": "n11-5",
    "num": "11.5",
    "title": "Wrongful Death Pedestrian, SOL Approaching",
    "category": "Pedestrian & Bicyclist Cases",
    "disposition": "escalate",
    "story": "The caller is Renata Cole, calling on behalf of her family — her father was killed as a pedestrian approximately 23 months ago in California, struck by a car whose driver fled the scene initially but was later identified through a partial plate and is now confirmed insured (Progressive). The family has never retained an attorney for this. Renata explains the family has been overwhelmed with grief and only recently started looking into \"whether anything could still be done.\"",
    "nuance": "Wrongful death pedestrian cases are the strongest category in the criteria — the criteria says we DEFINITELY sign these — with exactly one override: an SOL coming up. At 23 months in California, the standard 2-year personal injury SOL is roughly weeks from expiring. The case type alone would normally mean an automatic yes; the calendar says otherwise unless someone moves immediately.",
    "reason": "ESCALATE IMMEDIATELY. The case type (wrongful death, pedestrian, identified insured defendant) is the criteria's strongest \"definitely sign\" category — but the approaching SOL requires attorney confirmation TODAY on whether it can still be filed in time. Do not let this sit in a normal queue."
  },
  {
    "id": "n11-6",
    "num": "11.6",
    "title": "Bicyclist \"Doored\" by a Parked Car",
    "category": "Pedestrian & Bicyclist Cases",
    "disposition": "qualified",
    "story": "The caller is Felicity Cho, a bicyclist — right person. The accident happened 6 days ago. Felicity was riding in a bike lane alongside a row of parallel-parked cars when the driver of one of those cars opened their door directly into her path without checking — Felicity struck the open door and was thrown from her bike. The driver gave Felicity their insurance info (Allstate, confirmed active); no police report was made, but the driver acknowledged not checking before opening the door. Felicity has a sprained wrist and road rash on her arm and leg; she went to urgent care the same day, one follow-up scheduled.",
    "nuance": "Reps sometimes frame \"bike hit a stationary car\" as cyclist fault — the bike, after all, struck the car (or its door). But the door-opener is the negligent actor, and bicyclist vs auto cases follow the same take-regardless-of-fault rule as pedestrian cases anyway. Either analysis lands in the same place.",
    "reason": "QUALIFIED. The door-opening driver's insurance is active and identified; bicyclist vs auto cases are taken regardless of fault per the criteria, and here the driver acknowledged the dooring. Injury and same-day treatment confirmed."
  },
  {
    "id": "n11-7",
    "num": "11.7",
    "title": "Bicyclist, Hit-and-Run, Has Auto Policy With UM",
    "category": "Pedestrian & Bicyclist Cases",
    "disposition": "qualified",
    "story": "The caller is Anthony Brooks, a bicyclist — right person. The accident happened 7 days ago. Anthony was riding in a bike lane when a car making a turn cut across the lane and struck his bike, then drove off without stopping — Anthony got a partial plate but police couldn't identify the vehicle, logged as a hit-and-run. Anthony suffered a sprained knee and hip bruising; went to urgent care the same evening, PT twice weekly, no gaps. When asked about his own insurance, Anthony confirms he owns a Honda Civic with an active policy that includes UM coverage — \"my agent recommended adding it last year.\"",
    "nuance": "Anthony was on a bike — no vehicle of his own involved in the collision — and the instinct is \"my auto policy has nothing to do with this.\" But the criteria specifically allows a UM claim for a pedestrian or bicyclist who HAS auto insurance — the policy follows the person. Because Anthony's policy includes UM, the hit-and-run (no identified defendant) doesn't leave him without a coverage path.",
    "reason": "QUALIFIED. Anthony was not at fault (struck while in a bike lane by a turning vehicle that fled). The defendant is unidentified with no insurance to pursue directly, but Anthony's own auto policy includes UM, which the criteria allows bicyclists to use. Injury and same-day treatment with no gaps confirmed."
  },
  {
    "id": "n11-8",
    "num": "11.8",
    "title": "Pedestrian, Hit-and-Run, No Auto Policy at All",
    "category": "Pedestrian & Bicyclist Cases",
    "disposition": "not_qualified",
    "story": "The caller is Monique Davis, the pedestrian — right person. The accident happened 9 days ago around 6 AM while Monique was walking to catch a bus, crossing in a marked crosswalk with the signal in her favor. A car ran the red light, struck Monique, and the driver did not stop — witnesses say the car \"sped off.\" A police report was filed as a hit-and-run; Monique could only describe the car as \"a dark sedan, maybe a Honda,\" no plate. Monique suffered a broken wrist and bruising; ambulance to the ER, casted, orthopedic follow-up scheduled. When asked whether Monique has a car or any auto insurance policy of her own, she says, \"No, I don't drive — I've never owned a car or had an insurance policy.\"",
    "nuance": "This looks like it should fall under the same \"take all ped cases regardless of fault\" rule that qualified 11.2 — and Monique genuinely was not at fault at all (crossing with the signal, in the crosswalk). But \"regardless of fault\" doesn't mean \"regardless of available coverage.\" The defendant fled and is unidentified — no defendant insurance exists. The only remaining path, per the criteria, is the pedestrian's OWN auto insurance with UM. Monique has never had an auto policy of any kind.",
    "reason": "NOT QUALIFIED. The defendant is an unidentified hit-and-run driver with no insurance to pursue. The criteria allows a UM claim for a pedestrian with auto insurance that includes UM — Monique has no auto policy at all, so there is no UM to fall back on. Despite real injuries, prompt treatment, and zero fault, there is no insurance source available."
  },
  {
    "id": "n11-9",
    "num": "11.9",
    "title": "Bicyclist Parked, Struck, Not Yet Treated Inside the Window",
    "category": "Pedestrian & Bicyclist Cases",
    "disposition": "qualified",
    "story": "The caller is Paul Martinez, a bicyclist — right person. The accident happened 6 days ago. Paul was parking his bicycle outside a convenience store — not riding, just standing with it — when an SUV backing out of a parking space struck him, knocking him and the bike over. The SUV driver stayed, exchanged information, and claimed insurance (confirmed active, accepting the claim is \"under review\"). A police report was made. Paul has hip pain and back pain since the impact but has not yet sought any treatment — \"I figured it would calm down, but it's actually been getting a little worse, not better.\"",
    "nuance": "Functionally this is a pedestrian-style case (struck while standing, not riding) — take regardless of fault. The open item is treatment: \"not yet treated\" sounds disqualifying, but the accident is only 6 days old — still well inside the 30-day window. The rep's job is to confirm Paul is willing to start treatment now, not to reject for \"no Tx\" while the window remains open.",
    "reason": "QUALIFIED IF Paul is willing to begin treatment immediately (well within the 30-day window); NOT QUALIFIED only if he refuses treatment entirely. Liability and insurance are otherwise in order — driver's insurance is active and accepting the claim, and Paul was not riding/operating anything, consistent with the take-regardless-of-fault pedestrian-style rule."
  },
  {
    "id": "n12-1",
    "num": "12.1",
    "title": "Hit-and-Run, PC Has UM, Not at Fault",
    "category": "Um / Uninsured / Hit-And-Run",
    "disposition": "qualified",
    "story": "The caller is Bethany Frost, the driver — right person. The accident happened 6 days ago. Bethany was driving through an intersection on a green light when another car ran the red, clipped the front corner of her car, and sped away — partial plate, general description, police report filed as a hit-and-run with the defendant unidentified. Bethany's front bumper and headlight are damaged; neck pain, urgent care 3 days later, follow-up scheduled. Bethany has confirmed with her carrier that her policy includes UM coverage and was active on the DOL.",
    "nuance": "Hit-and-run is one of the three triggers for a UM claim (defendant has no coverage, hit-and-run, or insured ped/bicyclist). The fleeing driver doesn't end the case if PC's own policy has UM — and here, Bethany's story (going straight on green, clipped by a red-light runner who fled) clearly places her as not at fault.",
    "reason": "QUALIFIED through Bethany's UM coverage. Not at fault (T-boned/clipped while going straight on green by a fleeing red-light runner), UM confirmed active (also satisfies Prop 213), injury and treatment within 30 days confirmed."
  },
  {
    "id": "n12-2",
    "num": "12.2",
    "title": "Hit-and-Run, No UM at All",
    "category": "Um / Uninsured / Hit-And-Run",
    "disposition": "not_qualified",
    "story": "The caller is Walter Briggs, the driver — right person. The accident happened 8 days ago. Walter was driving on a side street when a car ran a stop sign, clipped his rear quarter panel, and drove off — Walter didn't get a plate, and police logged it as a hit-and-run with no suspect identified. Walter's rear bumper and quarter panel are dented. He has neck soreness, treated within the week. When asked about his own coverage, Walter says, \"I just have basic liability — the cheapest option, that's it.\"",
    "nuance": "No identified defendant means no defendant insurance; \"basic liability — the cheapest option\" almost always means no UM endorsement. Both coverage doors are closed: there's no one to pursue, and no substitute policy to fall back on.",
    "reason": "NOT QUALIFIED. There is no insurance source to pursue — defendant unidentified/fled, and Walter's basic liability policy does not include UM. Despite being not at fault, there's no coverage path under the criteria."
  },
  {
    "id": "n12-3",
    "num": "12.3",
    "title": "Hit-and-Run, PC Unsure of UM Status",
    "category": "Um / Uninsured / Hit-And-Run",
    "disposition": "conditional",
    "story": "The caller is Diane Castillo, the driver — right person. The accident happened 6 days ago. Diane was rear-ended at a light by a car that then fled — police logged it as a hit-and-run, no plate obtained. Diane's bumper is dented; neck pain, urgent care 3 days later. When asked about UM coverage, Diane says, \"I genuinely don't know — I've had the same policy for years and never really looked at the details. I could call my agent though.\"",
    "nuance": "\"I don't know\" is fundamentally different from \"no.\" Rejecting outright on uncertainty throws away a potentially qualified case; signing outright risks a file with no actual coverage path if UM turns out absent. The correct move is neither — it's a pending disposition while Diane confirms.",
    "reason": "CONDITIONAL — pending UM confirmation. QUALIFIED if Diane's policy includes UM (not at fault, rear-ended by a fleeing driver); NOT QUALIFIED if confirmed absent. Have Diane check her dec page or call her agent and follow up with the answer before finalizing."
  },
  {
    "id": "n12-4",
    "num": "12.4",
    "title": "Defendant's Insurance Card Was for a Lapsed Policy",
    "category": "Um / Uninsured / Hit-And-Run",
    "disposition": "qualified",
    "story": "The caller is Yusuf Karim, the driver — right person. The accident happened 9 days ago. Yusuf was rear-ended at a light; the other driver handed over an insurance card on the spot (Mercury). Police were not called. When Yusuf's attorney's office (in a prior, brief consult that didn't result in representation) tried to file a claim with Mercury, Mercury responded that the policy had lapsed for nonpayment about three weeks before the accident — the card the other driver showed was no longer valid. Yusuf has neck pain, treated within the week. When asked about his own coverage, Yusuf confirms his policy is active and includes UM.",
    "nuance": "A card is not coverage. The case silently converts from \"defendant has insurance\" into an uninsured-defendant scenario, and Yusuf's UM becomes the live question — which, fortunately, he has.",
    "reason": "QUALIFIED through Yusuf's UM. The defendant's policy was lapsed/inactive on the DOL (confirmed by the carrier), making the defendant effectively uninsured — but Yusuf's own active policy with UM provides the coverage path and satisfies Prop 213. Injury and treatment within 30 days confirmed."
  },
  {
    "id": "n12-5",
    "num": "12.5",
    "title": "\"Full Coverage\" With No UM Endorsement, Uninsured Defendant",
    "category": "Um / Uninsured / Hit-And-Run",
    "disposition": "not_qualified",
    "story": "The caller is Roger Aldana, the driver — right person. The accident happened 7 days ago. Roger was rear-ended at a light by a driver who, when police ran his information, came back uninsured. Roger's bumper is dented; neck pain, treated within the week. When asked about his own coverage, Roger says, \"Oh, I have full coverage — liability, collision, comprehensive, the whole package, I pay a lot for it every month.\" When the rep asks specifically about uninsured/underinsured motorist coverage, Roger pulls up his policy and confirms there is no UM/UIM endorsement listed at all.",
    "nuance": "\"Full coverage\" is a sales phrase, not a coverage type. Collision and comprehensive pay for the CAR — they do not fund a bodily injury claim against an uninsured driver. Only a UM/UIM endorsement does that, and Roger's policy, despite sounding comprehensive, does not have one.",
    "reason": "NOT QUALIFIED for the injury claim. The defendant is confirmed uninsured, and Roger's policy — despite being marketed/perceived as \"full coverage\" — has no UM/UIM endorsement. No defendant insurance and no UM means no bodily injury coverage path under the criteria."
  },
  {
    "id": "n12-6",
    "num": "12.6",
    "title": "Pushed Into an Insured Car by an Uninsured Car, PC Has UM",
    "category": "Um / Uninsured / Hit-And-Run",
    "disposition": "qualified",
    "story": "The caller is Denise Parker, the driver — right person. The accident happened 8 days ago. Denise was stopped in traffic. The car behind her rear-ended her hard, pushing her into the car stopped in front of her. The car in front did nothing wrong — it was stopped, like Denise. The driver who hit Denise from behind came back as uninsured when police ran his info; the car Denise was pushed into has active insurance (Progressive), and that driver's insurer is now asking Denise about the contact with their insured. Denise has back, neck, and shoulder pain; ER same day, chiropractic care after, no gaps. Denise confirms her own policy is active with UM coverage.",
    "nuance": "\"The car in front has insurance — can't we use theirs?\" is the instinct, since it's the only active policy in the picture. But insurance follows FAULT, not availability — the front car did nothing wrong and owes Denise nothing. The correct path is Denise's own UM against the uninsured driver who actually caused the chain reaction.",
    "reason": "QUALIFIED through Denise's UM. The at-fault driver (rear) is uninsured; Denise was not at fault (pushed into the front car, which did nothing wrong). Denise's UM provides the coverage path and satisfies Prop 213. Injury (ER, chiropractic) and treatment within 30 days, no gaps, confirmed. The front car's insurer should be directed to the actual at-fault party, not engaged as a source of recovery."
  },
  {
    "id": "n12-7",
    "num": "12.7",
    "title": "Pushed Into an Insured Car by an Uninsured Car, PC Has No UM",
    "category": "Um / Uninsured / Hit-And-Run",
    "disposition": "not_qualified",
    "story": "The caller is Christine Pham, the driver — right person. The accident happened 8 days ago. Christine was stopped in traffic. The car behind her rear-ended her hard, pushing her into the car stopped in front of her. The car in front did nothing wrong — it was stopped, like Christine. The driver who hit Christine from behind came back as uninsured when police ran his info; the car Christine was pushed into has active insurance (Progressive), and that driver's insurer is now asking Christine about the contact with their insured. Christine has back, neck, and shoulder pain; ER same day, chiropractic care after, no gaps. When asked about her own coverage, Christine says, \"I have liability insurance, but I don't think I added that extra uninsured motorist thing — I remember my agent mentioning it and I said I didn't need it.\"",
    "nuance": "This is the same fact pattern as 12.6 — Christine was pushed into a blameless front car by an uninsured rear driver, and the front car's insurer isn't a viable target since that driver did nothing wrong. In 12.6, Denise's own UM was the path to recovery against the actual at-fault (uninsured) driver. Here, the only thing that's changed is that Christine declined UM coverage when offered — and without it, there's no policy standing behind the at-fault driver at all.",
    "reason": "NOT QUALIFIED. The at-fault driver (rear) is uninsured, and Christine has no UM coverage to fall back on. The front car's insurer correctly has nothing to pay, since their insured did nothing wrong — and there is no other insurance source to pursue. Despite identical liability and injury facts to 12.6, the absence of UM is the entire difference between a qualified and unqualified case here."
  },
  {
    "id": "n12-8",
    "num": "12.8",
    "title": "UM Exists, But PC's Own Story Places Them at Fault",
    "category": "Um / Uninsured / Hit-And-Run",
    "disposition": "not_qualified",
    "story": "The caller is Omar Fadel, the driver — right person. The accident happened 7 days ago. Omar describes running a stop sign — \"I'll be honest, I didn't fully stop, I was kind of rolling through, and a car I didn't see hit my passenger side and then took off.\" Police logged it as a hit-and-run on the other vehicle, but also noted in their report that Omar failed to stop at the posted stop sign. Omar has neck pain, treated within the week. Omar confirms his own policy includes UM.",
    "nuance": "Omar has UM, and the defendant fled — on the surface, this looks like 12.1 (hit-and-run + UM = qualified). But UM is a coverage source, not a fault eraser, and the criteria's UM provision carries one condition: it can only be used if the PC is NOT at fault. Omar's own account — rolling through a stop sign — places him at fault for the underlying collision.",
    "reason": "NOT QUALIFIED. Omar's own story (failing to stop at a stop sign, also noted in the police report) places him at fault, which forecloses the UM path regardless of his coverage. UM existing does not override a fault problem."
  },
  {
    "id": "n12-9",
    "num": "12.9",
    "title": "Falling Debris From a Truck — No Physical Contact With the Vehicle",
    "category": "Um / Uninsured / Hit-And-Run",
    "disposition": "not_qualified",
    "story": "The caller is Marcus Webb, the driver — right person. The accident happened 5 days ago on the freeway. Marcus was driving behind a flatbed truck when a large piece of lumber slid off the back and struck his windshield and hood, causing significant damage. The truck did not stop — it kept moving and Marcus lost it in traffic before getting a plate. No plate number obtained, description only as \"a large flatbed.\" Police report filed, noting falling debris as the cause. Marcus has neck pain and headaches from the sudden jolt; he went to urgent care two days later and has a follow-up scheduled. When asked about his own insurance, Marcus confirms he has an active policy with UM coverage.",
    "nuance": "This looks like a hit-and-run — an unidentified truck drove off, Marcus has UM. But UM hit-and-run coverage requires physical contact between the uninsured vehicle and the PC's vehicle (or the PC directly). A piece of cargo falling off a truck is NOT the truck making contact. The truck's body never touched Marcus's car — only the debris did. Most UM policies and state statutes specifically require direct vehicle-to-vehicle contact for the hit-and-run provision to apply. An \"indirect\" strike through falling cargo does not satisfy it. A story can be created in the UM section documenting the incident, but the claim does not qualify.",
    "reason": "NOT QUALIFIED. UM hit-and-run coverage requires direct physical contact between the uninsured vehicle and the PC or PC's vehicle. The truck never contacted Marcus's car — only the debris did. With no identified defendant and no vehicle-to-vehicle contact, there is no coverage path despite Marcus having UM. Create a story in the UM section, but do not sign the case."
  },
  {
    "id": "n13-1",
    "num": "13.1",
    "title": "California, Defendant Fully Insured, PC Driver Uninsured",
    "category": "Prop 213 & State-Specific Rules",
    "disposition": "not_qualified",
    "story": "The caller is Eric Sandoval, the driver — right person. The accident happened 10 days ago in Los Angeles. Eric was stopped at a red light when another car rear-ended him — clean liability, the other driver was cited for following too closely, and his insurance (Mercury) is active and has already accepted the claim. Eric's rear bumper is dented, trunk doesn't close. He went to urgent care 3 days later, chiropractic care since, no gaps. When the rep runs through Eric's own coverage as a routine check, Eric says, \"Oh — actually, no, I let my insurance lapse about two months ago, I was going to renew it this weekend. I didn't think it mattered since the other guy clearly hit me and he has insurance.\"",
    "nuance": "Every box that normally matters is checked: clear liability, citation, active defendant insurance that has already accepted the claim, real injury, prompt and consistent treatment. A rep moving quickly will see \"defendant has insurance — confirmed, accepted\" and mark insurance satisfied. But that only answers HALF of the insurance question. California separately requires the PC DRIVER be insured on the date of loss — Prop 213. Eric's policy had lapsed two months prior. The defendant's insurance accepting the claim does not cure this.",
    "reason": "NOT QUALIFIED. Defendant insurance exists and the claim is accepted — but Eric, the PC driver, had no active auto insurance on the date of loss in California. Per the criteria, the PC cannot be Prop 213 in CA auto cases. This is a separate, independent disqualifier not cured by the defendant's coverage, regardless of how clean liability otherwise is."
  },
  {
    "id": "n13-2",
    "num": "13.2",
    "title": "Nevada, Uninsured PC Driver, Solid Liability and Damages",
    "category": "Prop 213 & State-Specific Rules",
    "disposition": "qualified",
    "story": "The caller is Felipe Garza, the driver — right person. The accident happened 9 days ago in Las Vegas, Nevada. Felipe was stopped at a light when another car rear-ended him hard enough to push him into the intersection — the other driver was cited for following too closely, insurance (Allstate) confirmed active. Felipe's car sustained significant rear and front damage (rear from the impact, front from being pushed forward into the car ahead, though the car ahead has no claim against Felipe since he was pushed). Felipe suffered a herniated disc, confirmed by MRI, and has been in extensive physical therapy with injections recommended. When asked about his own coverage, Felipe confirms he had no active auto policy on the date of loss.",
    "nuance": "Same uninsured-PC-driver fact as 13.1 — but the state is Nevada, not California. The criteria states NV uninsured clients are NOT considered Prop 213. NV also requires solid liability and extensive damages, both of which are present here (cited rear-end, herniated disc with injections recommended).",
    "reason": "Potentially QUALIFIED — escalate for confirmation. Felipe's uninsured status does not create a Prop 213 problem in Nevada. Liability is solid (cited rear-end) and damages are extensive (herniated disc, MRI-confirmed, injections recommended) — both meeting NV's elevated bar. Route to the manager to finalize given the significant injury."
  },
  {
    "id": "n13-3",
    "num": "13.3",
    "title": "California, Uninsured PASSENGER (Not a Driver)",
    "category": "Prop 213 & State-Specific Rules",
    "disposition": "qualified",
    "story": "The caller is Tasha Bell, who was a passenger — right person. The accident happened 8 days ago in California. Tasha was riding in a friend's car when a third-party defendant ran a red light and T-boned them — the friend (Tasha's driver) was not at fault, the other driver was cited, and that driver's insurance (Geico) is confirmed active. Tasha has a fractured wrist, confirmed by X-ray, casted, orthopedic follow-up scheduled. Tasha doesn't own a car and has never had her own auto insurance policy — \"I don't drive, I don't have a license even.\"",
    "nuance": "\"Uninsured\" triggers Prop 213 alarm bells for CA cases — but Prop 213 concerns the uninsured OWNER/OPERATOR of a vehicle. Tasha was a passenger, operating nothing, and her driver (not at fault) had nothing to do with her own insurance status. Reps over-extend Prop 213 to anyone without a personal auto policy, regardless of their role in the accident.",
    "reason": "QUALIFIED. Tasha's lack of a personal auto policy does not create a Prop 213 problem — she was a passenger, not an uninsured driver/owner. The third-party defendant was cited and has active insurance. Injury (fractured wrist) and treatment confirmed."
  },
  {
    "id": "n13-4",
    "num": "13.4",
    "title": "Brand-New Car Purchase, Insurance \"Not Yet in Effect\"",
    "category": "Prop 213 & State-Specific Rules",
    "disposition": "escalate",
    "story": "The caller is Whitney Park, the driver — right person. The accident happened 5 days ago in California, just three days after Whitney bought a new car. Whitney says, \"I signed up for insurance the same day I bought the car — I have the paperwork — but when I called to file the claim, they told me the policy wasn't active yet on the date of the accident, something about a processing delay.\" The defendant in the accident was cited for an unsafe lane change and has active insurance (Travelers). Whitney has neck pain, treated within the week.",
    "nuance": "If the policy genuinely was not in force on the DOL, Whitney may be an uninsured CA driver for Prop 213 purposes despite having tried to get coverage immediately. Whether a grace period, a binder that was actually effective despite \"processing,\" or coverage under a prior policy on another vehicle rescues this is an attorney-level question — not something a rep can determine from \"I signed up the same day.\"",
    "reason": "ESCALATE. Gather the exact effective date on the new policy's paperwork, the exact DOL, and whether Whitney had ANY other active auto policy (e.g., on a previous vehicle) on that date — then route to the manager/attorney. Do not sign or reject solo; this is precisely the kind of borderline Prop 213 timing question the criteria does not resolve at the rep level."
  },
  {
    "id": "n13-5",
    "num": "13.5",
    "title": "Out-of-State Accident, California-Based Caller",
    "category": "Prop 213 & State-Specific Rules",
    "disposition": "escalate",
    "story": "The caller is Janelle Foster, the driver — right person. Janelle lives in Los Angeles, California, but the accident happened 10 days ago while she was on a road trip through Arizona. Janelle was stopped in traffic on a highway outside Phoenix when she was rear-ended. An Arizona state trooper cited the other driver for following too closely; his insurance (Progressive) is active. Janelle's rear bumper and tailgate are significantly damaged. She suffered neck and shoulder pain and went to urgent care near her home in LA 3 days after the accident, PT since, no gaps. Janelle's own California policy was active on the DOL.",
    "nuance": "Every fact about this case is strong — clear liability, citation, active defendant insurance, prompt and consistent treatment, active PC policy. The wrinkle is purely geographic: the ACCIDENT happened in Arizona, even though the caller lives in and calls from California. The accident's location governs, not the caller's home state. Arizona is neither CA nor NV — not a state the team directly signs, but also not an automatic reject.",
    "reason": "ESCALATE for referral routing. The underlying case appears strong. Per the criteria, for out-of-state cases outside CA/NV, screen as usual, and if it looks like a good case (as this one does), run it by Jubin for confirmation on which firm to refer it to, always CC'ing the manager. This is a routing decision, not a rejection."
  },
  {
    "id": "n13-6",
    "num": "13.6",
    "title": "Nevada, Soft Liability and Moderate Damages",
    "category": "Prop 213 & State-Specific Rules",
    "disposition": "not_qualified",
    "story": "The caller is Nicole Foster, the driver — right person. The accident happened 9 days ago in Reno, Nevada. Nicole describes a lane-merge dispute — both vehicles merging into the same lane at the same time, no witness, no dashcam, no police report, insurance exchanged and active on both sides. Nicole has neck soreness, treated with one urgent care visit and at-home exercises, no further appointments scheduled.",
    "nuance": "This is the same disputed-merge fact pattern as Scenario 3.3 (where it landed as ESCALATE-leaning-NOT-QUALIFIED even in a state with no extra bar). Here, the SAME ambiguous liability and modest treatment occur in NEVADA — which requires ALL standard criteria PLUS solid liability and extensive damages. A case that might rate a cautious escalation in California is a cleaner reject in Nevada.",
    "reason": "NOT QUALIFIED. Disputed liability (both vehicles merging, no independent evidence) plus moderate damage/treatment fails Nevada's elevated bar of solid liability and extensive damages, on top of the underlying liability problem itself."
  },
  {
    "id": "n13-7",
    "num": "13.7",
    "title": "Motorcyclist Rear-Ended, Standard Criteria Apply",
    "category": "Prop 213 & State-Specific Rules",
    "disposition": "qualified",
    "story": "The caller is Derrick Banks, a motorcyclist — right person. The accident happened 7 days ago. Derrick was stopped at a red light on his motorcycle when a car behind him failed to stop in time and struck his rear wheel, knocking the bike (and Derrick) over. Police cited the driver for following too closely; insurance (State Farm) is active. Derrick has road rash, a sprained wrist, and back pain; he went to the ER the same day, started PT 4 days later, no gaps. Derrick worries, \"I feel like insurance companies always try to blame the motorcycle rider, even when it's not our fault.\"",
    "nuance": "Derrick's concern is understandable but the criteria doesn't add any extra hurdle here: motorcycle vs auto follows the EXACT same criteria as auto vs auto. No extra hesitancy is warranted, but also no extra leniency — it's evaluated like any other rear-end.",
    "reason": "QUALIFIED. Standard auto criteria fully met: cited rear-end defendant, active insurance, real injury (road rash, sprain, back pain), ER same day and PT within 30 days with no gaps. Derrick's own policy active. Motorcycle vs auto = auto vs auto, nothing more, nothing less."
  },
  {
    "id": "n14-1",
    "num": "14.1",
    "title": "Fresh Case, Inside the Window, Willing to Treat",
    "category": "Injury & Treatment Timing",
    "disposition": "qualified",
    "story": "The caller is Priscilla Owens, the driver — right person. The accident happened 4 days ago. Priscilla was rear-ended at a stoplight; the other driver was cited and has active Farmers insurance. Priscilla's bumper is dented. She says, \"My neck and shoulder have been pretty stiff and sore since it happened — I've just been so busy with work I haven't had a chance to go in yet.\" When the rep asks whether she'd be willing to be seen and follow a treatment plan if the attorney helps arrange it, Priscilla says, \"Yes, absolutely — if you guys can help me find someone close to my office, I'll go this week.\"",
    "nuance": "This is the ideal fresh case — inside the 30-day window, real pain, and an affirmative commitment to treat. The criteria's injury requirement has two parts: injured AND willing to receive treatment. Priscilla satisfies both.",
    "reason": "QUALIFIED. Priscilla is injured and has committed to beginning treatment promptly, well within the 30-day window. Liability (cited defendant) and insurance (active) are confirmed."
  },
  {
    "id": "n14-2",
    "num": "14.2",
    "title": "Property Damage Only, No Injury Claimed",
    "category": "Injury & Treatment Timing",
    "disposition": "conditional",
    "story": "The caller is Walter Briggs, the driver — right person. The accident happened 5 days ago. Walter was rear-ended at a light; the other driver was cited, insurance (Allstate) active. Walter's bumper has a visible dent and a cracked taillight. Walter says clearly, \"I'm not hurt at all, honestly — I just want them to pay to fix my car. The insurance company is being slow about it.\" When the rep asks if he's felt any pain, stiffness, or soreness at all since the accident, Walter says, \"No, genuinely nothing. I feel completely normal.\" The rep explains that it's common for whiplash and other soft-tissue injuries to not show up for a few days after an accident, and asks if Walter would be open to getting checked out now, just in case — especially since being seen this early would help if anything does turn up later. Walter says, \"Huh, I didn't know that. I guess it wouldn't hurt to get checked, sure.\"",
    "nuance": "Clean liability, active insurance, real property damage — every box except the one that matters most for a personal injury case. The criteria requires the PC to be INJURED, and property damage alone is never enough, no matter how clean the liability. But \"no pain right now\" isn't the end of the conversation on a 5-day-old accident — delayed-onset soreness is common, and a PC who is willing to get checked out converts an outright property-damage call into a live one. (Do not coach Walter into claiming pain he doesn't have — the offer to get checked has to be genuinely about catching something that develops, not manufacturing a claim.)",
    "reason": "CONDITIONAL. As described — no injury, property damage only — this is NOT QUALIFIED on its own. But Walter has agreed to get checked out given that delayed-onset pain is common, which keeps the door open: if he's seen within the 30-day window and something is found (even mild soft-tissue strain), the case becomes QUALIFIED on those new facts. If he declines to follow through or nothing is ever found, it remains a property damage matter only."
  },
  {
    "id": "n14-3",
    "num": "14.3",
    "title": "Injured But Refuses Treatment",
    "category": "Injury & Treatment Timing",
    "disposition": "not_qualified",
    "story": "The caller is Greg Halloway, the driver — right person. The accident happened 4 days ago. Greg was rear-ended at a stoplight; the other driver was cited and has active Farmers insurance. Greg's bumper is dented. Greg says, \"Yeah, my neck's been kind of stiff and sore since it happened.\" When the rep asks if he's seen a doctor or has anything scheduled, Greg says, \"Nah, I don't really do doctors — I figure it'll work itself out. I just want to know what I can get for the inconvenience and the car stuff.\" When the rep gently explains that ongoing treatment is generally part of how these cases work and asks if he'd be open to being seen if the attorney helps arrange it, Greg says, \"Honestly, probably not — I'm just not really a doctor person.\"",
    "nuance": "Greg has real liability, real property damage, and real pain — everything except one thing lines up. The criteria's injury requirement has two parts: injured AND willing to receive treatment. Greg satisfies only the first half, even after the rep's explanation of why treatment matters.",
    "reason": "NOT QUALIFIED. Injury alone is not enough — the criteria requires willingness to receive treatment, and Greg has declined even after the rep explained why it matters. Liability and insurance are otherwise sufficient; treatment willingness is the sole disqualifier."
  },
  {
    "id": "n14-4",
    "num": "14.4",
    "title": "First Treatment on Day 31",
    "category": "Injury & Treatment Timing",
    "disposition": "escalate",
    "story": "The caller is Patricia Nguyen, the driver — right person. The accident happened about 6 weeks ago. Patricia describes a clean rear-end — stopped at a light, hit from behind, other driver cited, insurance (State Farm) active and not disputing liability. Patricia's bumper was damaged, since repaired. When the rep asks when she first sought treatment, Patricia initially says \"about a month after,\" but when the rep pins down the exact dates — accident date and first visit date — the math works out to 31 days after the accident, the day she first saw a chiropractor for ongoing neck pain.",
    "nuance": "\"About a month\" is the phrase that hides this issue. The window is treatment within the FIRST 30 DAYS — day 31 misses it by a single day. Reps who round \"about a month\" in the PC's favor will miss this; the only fix is pinning exact calendar dates for both the accident and the first visit. A miss by one day is different from a miss by weeks — some firms will still take a day-31 case, but that's a firm-by-firm call, not a rep-level yes.",
    "reason": "ESCALATE. First treatment fell on day 31 — technically outside the 30-day window, but only by a single day. Document the exact dates precisely (accident date and first visit date) and route to the manager/attorney — some firms will still take a case this close to the line, even though it isn't an automatic yes at the rep level."
  },
  {
    "id": "n14-5",
    "num": "14.5",
    "title": "ER Same Day, Then a 3.5-Month Gap",
    "category": "Injury & Treatment Timing",
    "disposition": "not_qualified",
    "story": "The caller is Patricia Nguyen, the driver — right person. The accident happened 4 months ago — same clean rear-end facts (cited defendant, active insurance). Patricia says, \"Yes, I went to the ER the day of the accident — they checked me out and said I had whiplash.\" When asked what happened after that: \"Honestly, I felt better after a week or two, so I didn't go back. But the last month or so it's been bothering me again, so I think I should get checked out now.\" She confirms no treatment since the same-day ER visit — a gap of roughly 3.5 months.",
    "nuance": "Patricia DID treat within the first 30 days — same-day ER, which would normally satisfy the initial-treatment requirement cleanly. The disqualifier is a SECOND, independent requirement that only applies because the case is now several months old: no gaps of 30 days or more. A 3.5-month gap is far beyond that threshold.",
    "reason": "NOT QUALIFIED. Although Patricia treated within 30 days (same-day ER), the criteria also requires no gaps of 30+ days on older cases — and Patricia has a roughly 3.5-month gap. The criteria notes very few exceptions exist; \"felt better, then it came back\" is not, on its face, a documented justifiable exception. If Patricia has some documented medical reason for the gap, raise it with the manager."
  },
  {
    "id": "n14-6",
    "num": "14.6",
    "title": "28-Day Gap, Resumed Consistently",
    "category": "Injury & Treatment Timing",
    "disposition": "qualified",
    "story": "The caller is Marcus Webb, the driver — right person. The accident happened 2 months ago. Marcus was rear-ended at a stoplight; the other driver was cited and has active Progressive insurance. Marcus's bumper was dented and the trunk misaligned, both repaired. Marcus went to urgent care 2 days after the accident for neck and back pain and began chiropractic care 5 days after that. He attended weekly sessions for three weeks, then — due to a family emergency requiring out-of-state travel — missed appointments for what the rep calculates, after getting exact dates, to be 28 days between his last pre-trip session and his first post-trip session. Since returning, he has resumed weekly sessions and attended two more visits.",
    "nuance": "A 28-day gap sits right at the edge of the rule reps are taught to fear. The threshold is gaps of 30 days OR MORE — 28 days does not reach it. Combined with timely initial treatment (urgent care at day 2, chiropractic at day 7) and resumed consistent care, the case remains intact. Precision — exact dates, not \"about a month\" — is what saves this case.",
    "reason": "QUALIFIED. Marcus treated within the first 30 days (urgent care at day 2, chiropractic at day 7), and his longest gap since is 28 days — under the 30-day threshold. Liability is clear, Marcus's own policy is active (Prop 213 satisfied). Document the exact dates carefully since this case sits close to the line."
  },
  {
    "id": "n14-7",
    "num": "14.7",
    "title": "\"I've Been Treating This Whole Time\" — Actually a 3-Month Gap",
    "category": "Injury & Treatment Timing",
    "disposition": "not_qualified",
    "story": "The caller is Jerome Tillman, the driver — right person. The accident happened 4 months ago — clean rear-end, defendant cited, insurance (Nationwide) active and accepting liability. Jerome's bumper was repaired. Jerome opens with, \"Yeah, I've been treating this whole time, my back's still bothering me.\" When the rep asks for specific provider names and visit dates, Jerome eventually narrows it down: two urgent care visits in the first two weeks after the accident, and — after some back and forth — nothing since. \"I guess now that you ask, yeah, it's probably been a few months since I went anywhere.\"",
    "nuance": "\"I've been treating this whole time\" is a phrase PCs use loosely to mean \"I'm still in pain,\" not \"I have an ongoing provider relationship.\" The rep's job is converting that vague claim into a dated, provider-by-provider timeline before dispositioning — which here reveals a roughly 3-month gap.",
    "reason": "NOT QUALIFIED. The actual timeline (two visits in the first two weeks, nothing since) shows a roughly 3-month gap, well over the 30-day threshold. The vague phrase \"I've been treating this whole time\" would have wrongly qualified it had the rep not pinned down dates and providers."
  },
  {
    "id": "n14-8",
    "num": "14.8",
    "title": "Documented Hospitalization-Caused Gap",
    "category": "Injury & Treatment Timing",
    "disposition": "escalate",
    "story": "The caller is Imani Carter, the driver — right person. The accident happened 3 months ago — a rear-end with a cited defendant and active insurance (Farmers). Imani treated immediately and consistently for the first month — physical therapy twice weekly. Then she was hospitalized for an unrelated medical issue (appendicitis, requiring surgery and a multi-week recovery) that made attending PT physically impossible for about 5 weeks. She has since resumed PT and is treating consistently again.",
    "nuance": "The criteria says there are very few exceptions to the 30-day gap rule, but if a rep feels the gap can genuinely be justified, it should be raised with the manager. A documented hospitalization for an unrelated medical emergency — verifiable, not a matter of preference or scheduling — is the textbook example of a gap a manager might actually approve.",
    "reason": "ESCALATE with documentation (hospital records/dates for the appendicitis and surgery). Do not auto-reject on the gap; do not sign solo either. This is precisely the \"consult the manager if you feel the gap can be justified\" situation the criteria describes."
  },
  {
    "id": "n14-9",
    "num": "14.9",
    "title": "Telehealth-Only Treatment Within the Window",
    "category": "Injury & Treatment Timing",
    "disposition": "escalate",
    "story": "The caller is Sandra Ibarra, the driver — right person. The accident happened 9 days ago — rear-ended at a light, defendant cited, insurance (Geico) active. Sandra's only \"treatment\" so far is a single phone call with her primary care doctor 4 days after the accident — no in-person exam, no imaging, no follow-up plan beyond \"call back if it doesn't improve.\" Sandra has ongoing neck pain. When the rep asks if she'd be willing to be seen in person and start a real treatment plan if the attorney helps arrange it, Sandra says, \"Yes, definitely — I just wanted to talk to someone first before going in.\"",
    "nuance": "A single telehealth call is thin as \"treatment\" — no exam, no imaging, no plan. But the criterion pairs injury with WILLINGNESS, and Sandra is both in pain and ready to commit to real treatment going forward, still well within the 30-day window.",
    "reason": "ESCALATE / leaning QUALIFIED. The telehealth call alone is thin, but Sandra's willingness to begin genuine in-person treatment now, within the window, is what the criteria is actually looking for. Get the in-person treatment started promptly; if Sandra were to refuse further treatment, this would become NOT QUALIFIED."
  },
  {
    "id": "n15-1",
    "num": "15.1",
    "title": "Mopping, No Signs Posted",
    "category": "Slip & Fall",
    "disposition": "qualified",
    "story": "The caller is Howard Lee, the customer who fell — right person. The incident happened 5 days ago around 11 AM at a department store. Howard was walking near the entrance when he slipped on a wet patch of floor and fell onto his tailbone and elbow. He later learned the entryway had been mopped shortly before, after a spill near the doors. Howard did not see any wet floor signs or cones anywhere near where he fell — he specifically looked around afterward, while still on the ground, and confirmed nothing was posted. A nearby employee saw him fall, helped him up, and called over a manager, who filled out a written incident report and gave Howard a copy with a claim reference number. Howard went to urgent care later that same day, diagnosed with a bruised tailbone and elbow contusion, one follow-up scheduled.",
    "nuance": "This hits every element: a listed negligence cause (mopping with no signs), a report to a manager who wrote it up, and same-day treatment. The criteria's qualifying pattern for mopping-related falls specifically requires NO wet floor signs were put out — which is confirmed here.",
    "reason": "QUALIFIED. The hazard (water from recent mopping with NO wet floor signs posted) matches the criteria's qualifying pattern exactly. Reported to a manager with a written report, treated same day — satisfying the slip & fall same-day/next-day requirement. Commercial location presumed to carry commercial liability insurance."
  },
  {
    "id": "n15-2",
    "num": "15.2",
    "title": "Mopping, Signs Posted",
    "category": "Slip & Fall",
    "disposition": "escalate",
    "story": "The caller is Carol Jennings, the customer who fell — right person. The incident happened 6 days ago around 2 PM at a large grocery store. Carol was walking down the dairy aisle when she slipped on a small puddle of water near a refrigerated case, falling onto her hip and wrist. An employee had been mopping that section about ten minutes earlier. A store employee helped her up, and a manager filled out an incident report on the spot. Carol went to urgent care that afternoon, diagnosed with a wrist sprain and bruised hip, one follow-up scheduled. When the rep asks Carol to describe the area right before she fell, Carol mentions, almost as an aside, \"There were actually a couple of those yellow 'wet floor' signs out, but I guess I just didn't see them because I was looking at the yogurt.\"",
    "nuance": "On the surface this looks like a complete, well-documented slip & fall — same-day treatment, written incident report from a manager, real injury. The detail Carol mentioned in passing undermines it: wet floor signs WERE posted. The criteria's qualifying pattern specifically requires NO signs; with signage present, the store likely met its duty of care.",
    "reason": "ESCALATE, leaning NOT QUALIFIED. Treatment timing, reporting, and injury are all solid — but posted wet floor signage undercuts the negligence theory the criteria relies on for mopping-related falls. Document exactly where the signs were placed relative to where Carol fell and route to the manager."
  },
  {
    "id": "n15-3",
    "num": "15.3",
    "title": "\"I Just Fell\" — No Identified Hazard",
    "category": "Slip & Fall",
    "disposition": "not_qualified",
    "story": "The caller is Russell Vance, the customer who fell — right person. The incident happened 5 days ago at a supermarket. Russell was walking in the produce aisle and fell, landing on his hip. When the rep asks what caused the fall, Russell says, \"I just lost my balance — I don't know, I went down. Maybe my shoe caught on something, I'm not sure.\" Russell didn't notice any liquid, food, or debris on the floor before or after the fall, and nothing was pointed out to him by staff. A nearby employee helped him up; no incident report was made because, per the employee, \"there wasn't really anything to report — he just fell.\" Russell went to urgent care the next day for hip soreness.",
    "nuance": "A slip & fall needs a negligence CAUSE — water, a liquid substance, spilled food, or unsigned mopping. \"I just fell, maybe my shoe caught on something\" with no hazard identified by Russell, staff, or anyone else is an accident, not a case — even though it happened on commercial property.",
    "reason": "NOT QUALIFIED. No negligence cause attributable to the property was identified — Russell cannot point to water, a spill, debris, or unsigned mopping, and no one else identified a hazard either. Without an identified cause, there is no slip & fall theory to pursue."
  },
  {
    "id": "n15-4",
    "num": "15.4",
    "title": "Squashed Grape, Verbal Report to a Cashier Only",
    "category": "Slip & Fall",
    "disposition": "escalate",
    "story": "The caller is Brenda Solis, the customer who fell — right person. The incident happened 6 days ago at a supermarket. Brenda slipped on a squashed grape in the produce aisle, falling and bruising her hip and elbow. Staff helped her up, and Brenda told the nearest cashier what happened — \"I told her I slipped on a grape over there and showed her my elbow, she said 'oh no, are you okay' and that was kind of it.\" Brenda did not speak to a manager and nothing was written down that Brenda is aware of. She went to the ER that evening for her hip and elbow.",
    "nuance": "Treatment timing is satisfied (same day). The weak point is the report — the criteria wants the incident reported to someone at the location, preferably a supervisor or manager who can write a report. A verbal mention to a cashier, with nothing written down, may have produced no record at all.",
    "reason": "ESCALATE. Verify whether the store has ANY record — an incident log the cashier might have filled out after the fact, security camera footage of the produce aisle, or anything else. The case survives or dies on whether the incident is documented anywhere; Brenda's verbal mention to a cashier alone is the weak link, not the hazard (squashed grape, a listed example) or the treatment timing."
  },
  {
    "id": "n15-5",
    "num": "15.5",
    "title": "Ambulance Transport, No Written Report",
    "category": "Slip & Fall",
    "disposition": "qualified",
    "story": "The caller is Marvin Atkins, the customer who fell — right person. The incident happened 6 days ago at a department store. Marvin slipped on a spilled drink near a cocktail/sample area, falling hard and hitting his head. He was disoriented enough that paramedics were called, and he was transported by ambulance to the ER, where he was evaluated for a concussion (CT clear) and treated for a cut on his scalp. Marvin says, \"Honestly, after the ambulance came, I don't really know what happened with the store side of things — I was kind of out of it, and then I was just gone in the ambulance. I don't think anyone gave me any paperwork.\"",
    "nuance": "Normally, \"no written incident report\" would be the same red flag as Scenario 15.4. But the criteria carves this out specifically: when the PC is transported by ambulance, we can ASSUME a report of the incident was made. The written-report requirement is really aimed at situations where the PC leaves on their own and nothing gets documented.",
    "reason": "QUALIFIED (if other criteria met). The ambulance transport satisfies the reporting concern per the criteria's explicit carve-out. The hazard (spilled drink) is identified, and treatment (same-day ER, concussion workup) is confirmed."
  },
  {
    "id": "n15-6",
    "num": "15.6",
    "title": "Slip & Fall, Treated on Day 3",
    "category": "Slip & Fall",
    "disposition": "not_qualified",
    "story": "The caller is Denise Okafor, the customer who fell — right person. The incident happened 6 days ago at a grocery store. Denise slipped on a spill near a cooler, falling onto her hip. An employee saw it, and a manager filled out an incident report on the spot — properly documented. Denise felt \"shaken up but okay\" immediately afterward and didn't think much of it. Over the next two days, her hip got progressively more sore, and on day 3 she went to urgent care, where she was diagnosed with a hip contusion.",
    "nuance": "Reps trained on the AUTO 30-day rule may see \"day 3\" and think that's well within any reasonable window — and for an auto case, it would be. But slip & falls have their own, much shorter clock: treatment must be sought the SAME DAY or BY THE NEXT DAY. Day 3 misses it, despite excellent reporting and a clearly identified hazard.",
    "reason": "NOT QUALIFIED on treatment timing. The hazard is well-documented (incident report, identified spill) but treatment on day 3 falls outside the slip & fall same-day/next-day requirement — a different, stricter clock than the 30-day auto rule."
  },
  {
    "id": "n15-7",
    "num": "15.7",
    "title": "Casino Slip & Fall, California",
    "category": "Slip & Fall",
    "disposition": "not_qualified",
    "story": "The caller is Sheila Brandt, the patron who fell — right person. The incident happened 6 days ago at a casino in California. Sheila was walking near a cocktail service area when she slipped on what she believes was a spilled drink, falling and bruising her hip and elbow. A security guard came over, helped her up, and the casino's security office documented the incident with an incident report and pulled camera footage, per the guard. Sheila went to urgent care the same day, diagnosed with bruising, no fractures, one follow-up scheduled.",
    "nuance": "Every procedural box is checked exactly the way reps are trained to want: prompt report, documented by security, camera footage referenced, same-day treatment. The disqualifier has nothing to do with any of that — it's purely the LOCATION TYPE and STATE. The criteria contains a blanket rule specifically for casino slip & falls: do not take them in California, regardless of documentation quality.",
    "reason": "NOT QUALIFIED. Per the criteria, casino slip & fall cases are not taken in California, regardless of documentation, injury, or treatment. This is a categorical exclusion based on venue type and state."
  },
  {
    "id": "n15-8",
    "num": "15.8",
    "title": "Casino Slip & Fall, Nevada, Liability Clear",
    "category": "Slip & Fall",
    "disposition": "qualified",
    "story": "The caller is Donald Pierce, the patron who fell — right person. The incident happened 7 days ago at a casino in Nevada. Donald was walking near a bar area on the casino floor when he slipped on a puddle of liquid — he believes a drink had been spilled and not cleaned up — and fell onto his tailbone and wrist. A casino employee saw the fall, called over a supervisor, and the supervisor filled out a written incident report on the spot, noting the spill location; Donald was told the area's security cameras would have footage. Donald went to urgent care that same day, diagnosed with a wrist sprain and tailbone bruising, follow-up scheduled within the week.",
    "nuance": "Same fact pattern as 15.7 — casino, spilled liquid, prompt incident report, camera footage referenced, same-day treatment — with the ONE variable changed: the state. The criteria's casino carve-out is state-specific: not taken in California, but OK in Nevada as long as liability is there. Here, liability (an unaddressed spill causing the fall, documented by a written report and camera reference) is present.",
    "reason": "QUALIFIED. This is a Nevada casino slip & fall with liability supported by a same-day written incident report and referenced camera footage. The criteria allows Nevada casino cases when liability exists — unlike California, where they are categorically excluded. Treatment timing (same day) and injury confirmed."
  },
  {
    "id": "n16-1",
    "num": "16.1",
    "title": "Apartment Handrail Collapse, Same-Day Written Report",
    "category": "Premise Liability",
    "disposition": "escalate",
    "story": "The caller is Walter Briggs, the tenant injured — right person. The incident happened 5 days ago at the apartment complex where Walter has lived for two years. Walter was walking down the exterior stairwell to his unit, holding the handrail as usual, when a section of the handrail — which had been loose and wobbly for weeks, something Walter had verbally mentioned to the leasing office before but never in writing — gave way entirely. Walter lost his balance and fell down four steps, landing hard on his right side. Another tenant heard the fall and helped him up. Walter went straight to the leasing office, reported the fall, and the property manager filled out a written incident report that same day, noting the handrail had detached from its anchor point. Walter went to urgent care later that same afternoon, diagnosed with a fractured wrist (X-ray confirmed) and significant bruising to his hip and ribs, orthopedic follow-up scheduled within the week. Walter is confident the large, professionally managed complex carries liability insurance, though he doesn't have policy details himself.",
    "nuance": "This isn't a slip & fall (no liquid, no spill), so the same-day/next-day slip & fall treatment rule doesn't strictly apply — premise liability has its own, slightly softer timing standard: treatment within \"the first few days.\" Walter treated the SAME DAY, comfortably meeting that. The criteria adds that when an incident is reported the day it occurred AND injuries/liability are strong enough, there can be leniency — but this is explicitly a manager call, not a rep-level automatic yes.",
    "reason": "ESCALATE, leaning QUALIFIED. All the elements the criteria looks for are present: a defective condition (detached handrail), same-day written incident report from the property manager, same-day treatment, and a confirmed fracture. Confirm the property's liability insurance with the manager before finalizing — standard for a large managed complex but should be verified."
  },
  {
    "id": "n16-2",
    "num": "16.2",
    "title": "Injured at a Friend's Home, Defective Deck Board",
    "category": "Premise Liability",
    "disposition": "qualified",
    "story": "The caller is Renee Foster, the person injured — right person. The incident happened 7 days ago. Renee was visiting a friend's home for a barbecue. While walking across the back deck, a rotted board gave way under her foot, and her leg went through the gap, causing a deep scrape and a twisted ankle. The homeowner (Renee's friend) was apologetic and mentioned the deck had \"needed work for a while.\" Renee went to urgent care the same day, diagnosed with a sprained ankle and a deep laceration requiring several stitches, with a follow-up scheduled. When the rep asks whether the homeowner carries insurance, Renee says, \"I'm pretty sure — they've definitely talked about their homeowner's insurance before for other stuff.\"",
    "nuance": "Renee feels uncomfortable — \"I don't want to sue my friend.\" But the criteria explicitly lists homes you visit as a premise liability location, and the actual target of any claim is the homeowner's INSURANCE, not the friend personally. The friend's apparent awareness of the deck's condition (\"needed work for a while\") supports a negligence theory.",
    "reason": "QUALIFIED (pending confirmation of the homeowner's insurance). The defective deck board is a property condition the homeowner was aware needed attention — premise liability against the homeowner's policy, not against the friend personally. Treatment same day (including stitches) meets the \"first few days\" standard. Confirm the homeowner's policy exists before proceeding — no insurance would be the only remaining obstacle."
  },
  {
    "id": "n16-3",
    "num": "16.3",
    "title": "Struck by a Store Employee's Cart",
    "category": "Premise Liability",
    "disposition": "qualified",
    "story": "The caller is Lorraine Pitts, the customer — right person. The incident happened 6 days ago at a big-box store. Lorraine was standing in an aisle looking at a shelf when a store employee, pushing a large loaded restocking cart, came around the corner without looking and struck Lorraine from behind, knocking her into the shelving. A manager was called over immediately and filled out an incident report on the spot. Lorraine has a bruised hip and shoulder; she went to urgent care the same day, one follow-up scheduled.",
    "nuance": "This isn't a slip & fall — nothing was on the floor, and Lorraine didn't trip on anything. Reps scanning for \"spill,\" \"wet floor,\" or \"mopping\" may not know where to categorize this. The criteria's premise liability section explicitly includes situations where an employee themselves injured the PC — this is exactly that.",
    "reason": "QUALIFIED. An employee directly caused Lorraine's injury through their own negligent operation of a cart — covered under premise liability (employee-caused injury), not slip & fall. Same-day written incident report and same-day treatment satisfy the \"first few days\" premise liability timing. Commercial location presumed to carry liability insurance."
  },
  {
    "id": "n16-4",
    "num": "16.4",
    "title": "Injured at Work by a Third Party's Equipment",
    "category": "Premise Liability",
    "disposition": "qualified",
    "story": "The caller is Curtis Naylor, a construction worker — right person. The incident happened 8 days ago at a job site. Curtis works for a framing subcontractor, but the site has multiple companies working simultaneously. A crane operated by an entirely different company — an electrical subcontractor's equipment — swung a load that struck scaffolding Curtis was standing on, causing him to fall and break his arm. Curtis has filed a workers' comp claim through his own employer for the medical costs, but he wants to know if there's anything else he can do, since \"it wasn't anyone from my company that caused this.\"",
    "nuance": "\"Injured at work\" reflexively reads as workers' comp = not us. But the criteria's 3rd Party WC provision applies when the cause of injury comes from a third party — here, an entirely separate company's crane operation — rather than the PC's own employer or coworkers. Curtis's WC claim against his own employer doesn't preclude a separate claim against the third party whose equipment actually caused the injury.",
    "reason": "QUALIFIED as a 3rd Party WC claim. The injury was caused by a different company's crane operation, not Curtis's own employer — a genuine third party. This is takeable alongside Curtis's existing workers' comp claim against his own employer. Injury (broken arm) and same-day-of-incident medical attention confirmed."
  },
  {
    "id": "n16-5",
    "num": "16.5",
    "title": "Injured at Work, Solely by Own Employer's Equipment",
    "category": "Premise Liability",
    "disposition": "not_qualified",
    "story": "The caller is Donnie Rourke, a warehouse worker — right person. The incident happened 9 days ago. Donnie was operating a pallet jack owned and maintained by his employer when its wheel mechanism failed (a known issue, per Donnie — \"other guys had complained about that exact jack before\"), causing it to tip and injure Donnie's leg. No other company or outside party was involved in any way — it was entirely Donnie's employer's equipment, at Donnie's employer's facility, with only Donnie's coworkers present. Donnie has a workers' comp claim open through his employer.",
    "nuance": "This is the mirror image of 16.4 — same general fact pattern (injured at work by faulty equipment) but with NO third party anywhere in the picture. The equipment, the facility, and the people involved all trace back to Donnie's own employer.",
    "reason": "NOT QUALIFIED for personal injury representation. With no third party involved — only Donnie's own employer's equipment and personnel — this is purely a workers' compensation matter, which falls outside what this criteria covers. Donnie's existing WC claim through his employer is the correct (and only) path here."
  },
  {
    "id": "n16-6",
    "num": "16.6",
    "title": "Public Sidewalk Trip, Sprain Only",
    "category": "Premise Liability",
    "disposition": "not_qualified",
    "story": "The caller is Nadia Petrov, the pedestrian who fell — right person. The incident happened 8 days ago. Nadia was walking on a public sidewalk in front of a row of shops when her foot caught on a section of sidewalk pushed up and cracked, likely from a tree root underneath — a raised slab, maybe an inch and a half higher than the surrounding concrete. She tripped and fell forward, catching herself with her hands and twisting her ankle — a passerby helped steady her before she hit the ground fully. Nadia went home, iced her ankle, and when it was still swollen the next day, went to urgent care — moderate ankle sprain, no fracture, brace and rest, no further appointments. Nadia didn't report the sidewalk condition to the city.",
    "nuance": "Sidewalks are public property — a CITY claim, which carries a much higher bar than private premise liability: BIG INJURY is required, per the criteria. A moderate ankle sprain, treated with a brace and no fracture, sits well below that threshold, regardless of how clear the hazard (raised, cracked slab) was.",
    "reason": "NOT QUALIFIED. This is a city/sidewalk claim, requiring BIG INJURY. A moderate sprain with no fracture and no ongoing treatment plan does not meet that threshold."
  },
  {
    "id": "n16-7",
    "num": "16.7",
    "title": "Public Sidewalk Trip, Surgical Hip Fracture, California, Month 5",
    "category": "Premise Liability",
    "disposition": "escalate",
    "story": "The caller's daughter, Renata Cole, is calling on behalf of her mother, Esperanza Cole, who is 78 and was injured — Renata explains she's calling because her mother doesn't speak English well; Esperanza is present and confirms to the rep directly that Renata has her permission to assist (right person, with authorization). The incident happened just under 5 months ago. Esperanza was walking to the bus stop on a public sidewalk when she tripped over a large, severely uneven slab — similar root-heave damage to 16.6, but worse, with a nearly three-inch height difference. Esperanza fell hard and couldn't get up; a neighbor called 911, and she was taken by ambulance to the ER, where X-rays showed a fractured hip requiring surgery. She had hip surgery within a week and has been in PT and a rehab facility since, still actively treating with no gaps. No report was made to the city at the time — the family's focus was entirely on Esperanza's medical care.",
    "nuance": "This case clears the injury bar that 16.6 failed to clear — a surgical hip fracture is unambiguously a BIG INJURY, the threshold city/sidewalk claims require. But there's a second, time-sensitive issue: this is a CALIFORNIA government claim with an approximately 6-MONTH SOL from the date of loss. At just under 5 months, this case is alive — but only barely, and treating it like a normal-timeline intake risks the case dying from inaction before any claim form is filed.",
    "reason": "ESCALATE URGENTLY — potentially qualified. The surgical hip fracture meets the big-injury requirement for a city/sidewalk claim. But this is a CA government claim with an approximately 6-month SOL, already at roughly 5 months with no claim form filed. This needs to reach the manager/attorney immediately — the strength of the injury does not slow the clock."
  },
  {
    "id": "n16-8",
    "num": "16.8",
    "title": "Water Park Injury, Herniated Disc",
    "category": "Premise Liability",
    "disposition": "escalate",
    "story": "The caller is Cassandra Bell, the patron injured — right person. The incident happened 9 days ago at a water park. Cassandra went down a tube slide and, on landing in the pool at the bottom, felt an immediate sharp pain in her lower back. She reported it to a lifeguard, who had her fill out an incident form. Cassandra went to urgent care the next day; an MRI ordered by her doctor a week later showed a herniated disc, and she's been referred to a spine specialist, with injections being discussed.",
    "nuance": "A herniated disc requiring specialist referral and possible injections is a serious injury — but \"places of entertainment\" (theme parks, water parks, sports stadiums) carry TWO gates in the criteria: big injury and above ONLY, AND attorney approval is required to sign even when the injury clears that bar. A rep can never sign one of these solo, regardless of injury severity.",
    "reason": "ESCALATE — attorney approval is mandatory regardless of how the injury assessment comes out. The herniated disc/specialist referral plausibly clears the big-injury threshold, but per the criteria, places of entertainment require attorney sign-off even then. Below big injury, this would be NOT QUALIFIED outright."
  },
  {
    "id": "n17-1",
    "num": "17.1",
    "title": "Bite Requiring Stitches, Owner Identified",
    "category": "Dog Bites & Non-Bite Dog Injuries",
    "disposition": "qualified",
    "story": "The caller is Renee Foster, who was bitten — right person. The incident happened 8 days ago. Renee was visiting a neighbor's house when the neighbor's dog, normally kept in the backyard, got loose and bit Renee on the forearm when she reached down to pick up her dropped keys near the dog. The bite broke the skin in two places and bled heavily. Renee went to the ER the same day, where the wound was cleaned and closed with five stitches; she also received a tetanus shot and antibiotics, with a follow-up in one week to have the stitches checked/removed. Renee knows exactly who the dog's owner is — her neighbor of three years — and confirms the neighbor has homeowner's insurance (the neighbor mentioned it after the incident, apologizing and saying \"my insurance should cover this\"). No Animal Control report was filed, but the neighbor hasn't denied the bite happened or that it was their dog.",
    "nuance": "Dog bite cases are narrow, and the bar is specific: the bite needs to require ongoing care, with stitches as the baseline indicator. Renee's bite required five stitches plus antibiotics and a follow-up — squarely over that line. The other critical element is identifying a defendant with insurance: Renee knows exactly who the owner is and that homeowner's insurance exists, even without a formal Animal Control report.",
    "reason": "QUALIFIED. The bite required stitches (five), satisfying the injury-severity threshold. The owner is identified (a known neighbor) and homeowner's insurance is confirmed to exist. An Animal Control report is not strictly required when the owner is known and not disputing the incident."
  },
  {
    "id": "n17-2",
    "num": "17.2",
    "title": "Bite, No Stitches, Minor Wound",
    "category": "Dog Bites & Non-Bite Dog Injuries",
    "disposition": "not_qualified",
    "story": "The caller is Marcus Pelletier, who was bitten — right person. The incident happened 6 days ago while Marcus was at a friend's house and the friend's small dog, normally friendly, nipped at him after being startled, breaking the skin slightly on his hand. Marcus cleaned the wound himself with soap and water and put a bandage on it. Two days later, since it was still a little sore, he went to urgent care \"just to be safe\" — the provider examined it, confirmed it was a superficial puncture with no signs of infection, cleaned it again, and did not place any stitches, telling Marcus it would heal fine on its own. No follow-up was scheduled. Marcus knows exactly who the dog's owner is (his friend) and confirms the friend has renter's insurance.",
    "nuance": "This case has an identified owner with insurance — not the issue. The disqualifier is purely injury severity: urgent care explicitly determined stitches were not needed because the wound was superficial with no infection risk. This doesn't meet the stitches baseline, the infection-risk-despite-severe-wound carve-out, or the plastic-surgery threshold — it's simply a minor puncture that healed on its own.",
    "reason": "NOT QUALIFIED. The bite did not require stitches, and the medical provider's explanation for not stitching was that the wound was superficial with no infection risk (not that closing a severe wound would have created one). This does not meet the injury-severity threshold, even though the owner is known and insured."
  },
  {
    "id": "n17-3",
    "num": "17.3",
    "title": "Severe Bite, No Stitches Due to Infection Risk",
    "category": "Dog Bites & Non-Bite Dog Injuries",
    "disposition": "escalate",
    "story": "The caller is Yolanda Pruett, who was bitten — right person. The incident happened 7 days ago. Yolanda was bitten on the calf by a dog while walking past a yard with a partially broken fence — the dog got out and bit her, causing a deep, jagged wound that bled significantly. Yolanda went to the ER the same day. The ER doctor examined the wound, cleaned it thoroughly, prescribed a strong course of antibiotics — but explicitly did NOT close it with stitches, telling Yolanda, \"with a bite wound this deep and dirty, closing it up would trap bacteria inside and risk a serious infection — we need to leave it open and let it heal from the inside, with antibiotics and dressing changes.\" Yolanda has a follow-up in 3 days to check for infection and reassess. Yolanda knows the dog's owner (the homeowner with the broken fence) and confirms they have homeowner's insurance.",
    "nuance": "\"No stitches\" by itself would normally suggest a minor wound, as in 17.2. But the REASON matters: here, the ER explicitly stated the wound was severe enough that stitching it would CREATE an infection risk — the opposite of 17.2's \"superficial, no infection risk\" rationale. The criteria anticipates exactly this scenario as a path to qualification even without stitches.",
    "reason": "ESCALATE / potentially QUALIFIED. A severe wound left open specifically because closing it would risk infection — explicitly explained by the treating ER doctor — can satisfy the severity standard even without stitches. Document the medical explanation precisely (deep/jagged wound, antibiotics, scheduled infection-check follow-up) and route for confirmation; the owner is identified and insured."
  },
  {
    "id": "n17-4",
    "num": "17.4",
    "title": "Bite Requiring Plastic Surgery",
    "category": "Dog Bites & Non-Bite Dog Injuries",
    "disposition": "qualified",
    "story": "The caller is Trevor Hale, who was bitten — right person. The incident happened 6 days ago. Trevor was bitten on the face/cheek by a dog at a relative's house when the dog, startled by a loud noise, lunged and bit him before anyone could react. The wound was deep and disfiguring; Trevor was taken to the ER, which stabilized the wound and referred him urgently to a plastic surgeon — Trevor has a consultation scheduled for later this week to discuss reconstructive surgery for the scarring. The relative (dog's owner) has homeowner's insurance, confirmed.",
    "nuance": "This is its own listed qualifier in the criteria — above and beyond the stitches baseline. A facial bite requiring a plastic surgery referral doesn't need the \"did they get stitches\" analysis at all; \"injuries requiring plastic surgery\" is explicitly named as qualifying.",
    "reason": "QUALIFIED. Injuries requiring plastic surgery are explicitly listed as meeting the dog bite injury-severity threshold. The owner (relative) is identified and has homeowner's insurance. ER treatment and an urgent plastic surgery referral are confirmed."
  },
  {
    "id": "n17-5",
    "num": "17.5",
    "title": "Non-Bite Dog Injury, Fractured Hip From a Charge",
    "category": "Dog Bites & Non-Bite Dog Injuries",
    "disposition": "qualified",
    "story": "The caller is Eleanor Whitfield, age 71 — right person. The incident happened 6 days ago. Eleanor was walking on a sidewalk when a large dog, off-leash, ran at her from a nearby yard and slammed into her — never bit her, just struck her with its full weight while charging. Eleanor fell hard, fracturing her hip; she was taken by ambulance to the ER, X-ray confirmed the fracture, and she underwent surgery within days, now in rehab. Eleanor knows the dog's owner (the house the dog ran from) and confirms they have homeowner's insurance.",
    "nuance": "Reps who think \"dog case = bite required\" will reject this outright, since there was no bite at all. But the criteria covers non-bite dog injuries at the big-injury level: broken bones, head injury, concussion from the force of a charge/attack. A surgical hip fracture from being charged and knocked down by an off-leash dog fits squarely.",
    "reason": "QUALIFIED. A fracture from a dog's charge meets the non-bite big-injury standard explicitly listed in the criteria. The owner is identified and insured. Surgery and ongoing rehab confirm the injury severity."
  },
  {
    "id": "n17-6",
    "num": "17.6",
    "title": "Non-Bite Dog Charge, Bruising Only",
    "category": "Dog Bites & Non-Bite Dog Injuries",
    "disposition": "not_qualified",
    "story": "The caller is Gary Holcomb, the person charged by a dog — right person. The incident happened 5 days ago. Gary was walking and a dog ran at him from a yard, knocking into his legs and causing him to stumble and fall onto the grass — no bite, and Gary caught himself with his hands, avoiding a hard fall. He has some bruising on his forearms and a sore hip from the impact; he saw urgent care 3 days later, was told it's bruising/soft tissue, given OTC pain relief, no further appointments. Gary knows the dog's owner and confirms homeowner's insurance exists.",
    "nuance": "Same mechanism as 17.5 — a non-bite charging dog causing a fall — but the injury here is bruising and soreness only, not a fracture. The non-bite path exists ONLY for big injuries (broken bones, head injury, concussion). Bruising doesn't reach that bar, regardless of the owner being identified and insured.",
    "reason": "NOT QUALIFIED. Non-bite dog injuries below the big-injury level (here, bruising/soft tissue treated with OTC medication) are not taken, even with an identified, insured owner."
  },
  {
    "id": "n17-7",
    "num": "17.7",
    "title": "Severe Bite, Unknown Stray, No Identifiable Owner",
    "category": "Dog Bites & Non-Bite Dog Injuries",
    "disposition": "not_qualified",
    "story": "The caller is Desiree Holt, who was bitten — right person. The incident happened 7 days ago. Desiree was bitten on the leg by a dog she had never seen before while walking in her neighborhood — a stray, with no collar or tags. The bite was severe — deep puncture wounds requiring surgical debridement and a multi-day hospital stay due to infection risk. Animal Control was called and attempted to locate the dog but was unsuccessful; no owner has been identified, and the Animal Control report lists the dog as \"unidentified, at-large.\" Desiree has no idea whose dog it was or where it might live.",
    "nuance": "This is a severe injury — surgical debridement, hospitalization — that would otherwise clearly clear the bite-severity threshold (well beyond mere stitches). But dog cases run through homeowner's/renter's insurance, and the criteria is blunt: if there is no insurance, there is no claim — we have to make sure the PC at least knows where the defendant lives.",
    "reason": "NOT QUALIFIED. No identifiable, locatable owner exists (confirmed by Animal Control's \"unidentified, at-large\" finding) — meaning no homeowner's/renter's insurance to pursue, regardless of how severe the injury is."
  },
  {
    "id": "n18-1",
    "num": "18.1",
    "title": "Minor Passenger, Nevada, Uninjured, Injured Adult Signing",
    "category": "Minors (By State)",
    "disposition": "qualified",
    "story": "The caller is Marisol Vega, calling about an accident involving herself and her family — right person (injured adult signing). The accident happened 8 days ago in Las Vegas, Nevada. Marisol was driving with her husband (front passenger) and their 7-year-old son (back seat, booster seat) when another car ran a red light and T-boned the passenger side. Police cited the other driver for running the red light; insurance (Allstate) is active. Marisol suffered a concussion and went to the ER, started follow-up care with a neurologist; her husband has a sprained wrist, treated alongside her. When asked about their son, Marisol says, \"He was checked out at the ER too, just to be safe, and they said he's completely fine — no injuries at all, not even a bruise.\"",
    "nuance": "Same fact pattern as the California minor scenario — injured adults signing, uninjured minor in the vehicle, clear liability. Nevada mirrors California's rule on minors: ALL minors in the plaintiff's vehicle are accepted regardless of injury, as long as at least one injured adult is signing.",
    "reason": "QUALIFIED — for all three. Marisol and her husband meet standard auto criteria (T-boned by a cited red-light runner, active insurance, injury/treatment confirmed). The 7-year-old son, despite no injuries, is included per the Nevada rule mirroring California's for minors in the plaintiff's vehicle when an injured adult signs."
  },
  {
    "id": "n18-2",
    "num": "18.2",
    "title": "Minor Passenger, Colorado, Uninjured",
    "category": "Minors (By State)",
    "disposition": "qualified",
    "story": "The caller is Brandon Hayes, calling about an accident involving himself and his son — right person (injured adult signing). The accident happened 11 days ago in Denver, Colorado. Brandon was driving with his 10-year-old son in the back seat when another car ran a stop sign and struck the passenger side. Police cited the other driver for failing to stop; insurance (Allstate) is active and accepting the claim. Brandon's car has significant passenger-side damage. Brandon suffered rib bruising and a wrist sprain; ER same day, follow-up scheduled. His son was checked by paramedics at the scene and by his pediatrician two days later — both confirmed no injuries, no complaints, completely unharmed. Brandon's own policy is active.",
    "nuance": "Same fact pattern as 18.1 and the CA scenario — injured adult signing, clear liability, active insurance, uninjured minor in the vehicle. The only thing different is the STATE. Colorado's rule is the opposite of California/Nevada's: Colorado does not accept minors unless they are injured AND treating. Brandon's son, confirmed uninjured by two medical evaluations, does not meet that bar regardless of his father's status.",
    "reason": "Brandon is QUALIFIED on his own claim. His son is NOT QUALIFIED — Colorado requires minors to be injured AND treating, and the son has been confirmed uninjured by paramedics and his pediatrician. The same fact pattern in CA or NV would have included the son; in Colorado, it does not."
  },
  {
    "id": "n18-3",
    "num": "18.3",
    "title": "Minor Passenger, Washington, 16 Years Old, Soft Tissue",
    "category": "Minors (By State)",
    "disposition": "qualified",
    "story": "The caller is Renata Holcomb, calling about an accident involving herself and her teenage daughter — right person (injured adult signing). The accident happened 9 days ago in Seattle, Washington. Renata was rear-ended at a light; the other driver was cited for following too closely, insurance (Geico) active. Renata has neck pain, treated within the week. Her 16-year-old daughter, in the back seat, also has neck soreness — she went to urgent care alongside her mother and has been doing at-home stretches with one follow-up chiropractic visit scheduled, same as her mother.",
    "nuance": "Unlike the CO scenario (18.2), the WA daughter here IS injured and IS treating — which might seem to satisfy a \"minor needs injury + treatment\" standard. But Washington's rule is stricter still: no minors with no injuries OR soft-tissue injuries under age 17 — the only exception under 17 is BIG INJURY. A treating soft-tissue 16-year-old still fails; the same injuries in a 17-year-old (or an adult) would not face this restriction.",
    "reason": "Renata is QUALIFIED on her own claim (standard rear-end criteria met). Her 16-year-old daughter is NOT QUALIFIED — Washington excludes minors under 17 with soft-tissue injuries even when they are treating; only big injury creates an exception under 17."
  },
  {
    "id": "n18-4",
    "num": "18.4",
    "title": "California Minor Injured, No Injured Adult Signing",
    "category": "Minors (By State)",
    "disposition": "escalate",
    "story": "The caller is Desmond Carrow, calling about an accident — right person (the driver, but he is uninjured). The accident happened 7 days ago in California. Desmond was driving with his 9-year-old daughter in the back seat when another car ran a red light and T-boned the rear passenger side, exactly where his daughter was sitting. Police cited the other driver; insurance (Progressive) active. Desmond himself is completely uninjured — \"I'm totally fine, not even sore.\" His daughter, however, suffered a fractured arm, confirmed by X-ray, casted, with an orthopedic follow-up. Desmond's wife was not in the car. Desmond is calling only about his daughter's injury — he has nothing to sign for himself.",
    "nuance": "The CA blanket rule that included the uninjured minor in earlier scenarios (9.13, 18.1) was conditioned on at least one INJURED ADULT signing alongside the minor. Here, the situation is inverted: the minor is injured (fractured arm — clearly qualifying on her own injury merits), but there is no injured adult from the vehicle signing at all — Desmond is uninjured, and no other adult was present.",
    "reason": "ESCALATE. An injured-minor-only case, with no injured adult signing, falls outside the specific CA rule as stated (which conditions minor inclusion on an injured adult signing) — but the daughter's injury (fractured arm, cited defendant, active insurance) otherwise looks strong on its own merits. This combination needs manager/attorney direction on how to proceed when the minor is the only injured party in the vehicle."
  },
  {
    "id": "n19-1",
    "num": "19.1",
    "title": "Driver Hits a Deer",
    "category": "Natural Occurrences",
    "disposition": "not_qualified",
    "story": "The caller is Marcus Webb, the driver — right person. The accident happened 4 days ago on a two-lane rural highway in California at around 10 p.m. A deer ran out of the treeline directly in front of his car with no warning. Marcus hit it at highway speed — the airbags deployed, the hood buckled, the car was towed. He went to the ER that night with neck pain and a bruised sternum from the seatbelt. He has full coverage on his own vehicle including liability, collision, and uninsured motorist. When the rep asks who the other party is, Marcus says: \"There wasn't one. It was a deer. It just... ran out.\"",
    "nuance": "A personal injury case requires a liable third party — a person or entity whose negligence caused the injury. An animal in the road is not a liable party. There is no defendant, no insurance to pursue on a third-party basis, and no negligence claim to make. The caller's own collision coverage handles the vehicle; the injury itself is not a case we can take. This is true regardless of injury severity, treatment timing, or the caller's own insurance status.",
    "reason": "NOT QUALIFIED. A deer is not a motorist, a driver, or a liable party of any kind. There is no defendant to pursue, no third-party insurance to claim against, and no negligence to assert. The fact that the caller is injured and treated does not change the analysis — without a liable party, there is no case."
  },
  {
    "id": "n19-2",
    "num": "19.2",
    "title": "Passenger in Vehicle That Hits a Deer",
    "category": "Natural Occurrences",
    "disposition": "not_qualified",
    "story": "The caller is Sandra Okafor — not the driver. She was a passenger in her coworker's car. The accident happened 8 days ago: the coworker was driving on a highway at night, a deer leapt across the road, the car struck it, and Sandra was thrown forward into the dashboard despite wearing her seatbelt. She has neck and shoulder injuries, has been to urgent care twice. Sandra's position: \"I wasn't driving. My coworker hit the deer. So can I make a claim against her?\"",
    "nuance": "A passenger's instinct — correct in most situations — is to look at the driver as the potential defendant when they're not at fault. But here, the driver didn't cause the accident through any negligence. A deer appearing suddenly on a highway at night is not something a reasonable driver could have prevented. The cause of Sandra's injury was the animal, not the driver's negligence. Without negligence by the driver, there is no liability claim against the driver, and without any other liable party, there is no case.",
    "reason": "NOT QUALIFIED. Being a passenger does not change the fundamental requirement: there must be a negligent third party to pursue. The driver of the vehicle was not negligent — the deer was the cause. No liable party exists. Sandra's position as a passenger does not create a claim where none otherwise exists."
  },
  {
    "id": "n19-3",
    "num": "19.3",
    "title": "Has Uninsured Motorist Coverage, Hits a Deer",
    "category": "Natural Occurrences",
    "disposition": "not_qualified",
    "story": "The caller is James Holbrook, the driver — right person. He hit a deer 6 days ago on an interstate in Nevada. He has neck and back injuries; he went to the ER the same night and has a follow-up scheduled. He opens the call with: \"I know I have a case because I have uninsured motorist coverage, and the deer ran off without stopping.\" He has confirmed UM/UIM on his own policy and is emphatic that UM should apply here. The rep hears \"UM\" and pauses.",
    "nuance": "Uninsured Motorist coverage exists to protect you when a human driver with no insurance causes your accident. The word \"motorist\" is not figurative — it means a person operating a motor vehicle. A deer is not a motorist. UM does not apply to animals, road debris, or natural occurrences — only to uninsured human drivers. The caller's confident framing (\"the deer ran off without stopping\") is a misunderstanding of what UM covers, not evidence of eligibility. This is a common misconception; correct it clearly and compassionately.",
    "reason": "NOT QUALIFIED. Uninsured Motorist coverage applies to uninsured human drivers — not animals. A deer is not a \"motorist\" under any insurance policy. Having UM coverage does not create a personal injury case where no liable human party exists."
  },
  {
    "id": "n19-4",
    "num": "19.4",
    "title": "Swerves to Avoid Deer, Hits Guardrail — Single-Car Incident",
    "category": "Natural Occurrences",
    "disposition": "not_qualified",
    "story": "The caller is Priya Chandrasekaran, the driver — right person. The accident happened 5 days ago on a mountain highway in California. A deer stepped onto the road; Priya swerved hard left to avoid it, lost control, struck the center guardrail, and came to rest against the shoulder barrier. No other cars were involved. She did not hit the deer. She has back injuries and a laceration on her forearm from the airbag; ER same day, orthopedic follow-up scheduled. Her argument: \"I didn't hit the deer — I avoided it. The deer caused me to crash. Someone should be responsible.\"",
    "nuance": "The caller's instinct — that the deer \"caused\" the accident — is understandable, but it does not create legal liability. A deer on a road is a natural occurrence. Swerving to avoid a natural occurrence and losing control is a single-car incident regardless of what prompted the swerve. There is no liable third party: the deer cannot be sued, the road itself is not at issue (no known defect, no maintenance claim), and no human action caused the chain of events. Not hitting the deer is irrelevant to the analysis.",
    "reason": "NOT QUALIFIED. A single-car incident caused by swerving to avoid an animal is a natural occurrence with no liable third party. Whether the caller made contact with the deer or not does not change the analysis — the cause of the crash was the animal, and animals are not defendants."
  },
  {
    "id": "n19-5",
    "num": "19.5",
    "title": "Other Animal in Road — Same Rule Applies",
    "category": "Natural Occurrences",
    "disposition": "not_qualified",
    "story": "The caller is Tomás Guerrero, the driver — right person. The accident happened 3 days ago in Nevada. A large dog ran into the road from a neighborhood sidewalk; Tomás couldn't stop in time and struck it. The airbags deployed on impact, and Tomás has a concussion and wrist fracture from bracing against the steering wheel. He went to the ER immediately and has already had imaging done. He mentions that a neighbor later told him the dog belonged to a family on the street and was frequently let out unleashed. His question: \"If I can prove the dog had an owner and they were being negligent, is that a case?\"",
    "nuance": "This scenario introduces a wrinkle: a domestic animal with a potentially identifiable negligent owner (unleashed dog, known to roam). In theory, negligent pet owners can bear liability — but this is not a motor vehicle personal injury case as we define it. The incident is still a single-car accident caused by an animal entering the roadway. The caller's injury and treatment timing otherwise look fine, but without a liable motorist, this does not qualify as an auto case. If it proceeds at all, it is a premises or negligence matter handled differently — not a standard auto intake.",
    "reason": "NOT QUALIFIED as an auto personal injury case. Hitting any animal — deer, dog, or otherwise — in the road is a natural occurrence with no liable motorist. The potential existence of a negligent pet owner does not convert this into a standard auto intake. Do not qualify; if the caller wants to explore a negligence claim against the dog's owner separately, that is a different matter outside this call's scope."
  },
  {
    "id": "n20-1",
    "num": "19.1",
    "title": "Currently Represented by Another Firm",
    "category": "Procedural & Status",
    "disposition": "qualified",
    "story": "The caller is Cassandra Bell, the driver — right person, calling about her own accident. The accident happened about 7 weeks ago — a rear-end collision, clean liability, defendant cited, active insurance, Cassandra treating consistently with a chiropractor since the first week. Partway through the call, when the rep asks about prior representation, Cassandra says, \"Oh — yeah, actually I did sign with another firm a couple weeks after the accident, but I'm just not happy with them. They never call me back, I've left like four voicemails, and I feel like my case is just sitting there. I want to switch to you guys.\" When the rep asks if she has formally ended the relationship with the other firm, Cassandra says, \"No, I haven't told them anything, I just stopped calling and started looking around.\"",
    "nuance": "The underlying accident facts are excellent — this would be a clean QUALIFIED case on liability, injury, treatment, and insurance alone. Cassandra is currently signed with another firm, but clients are free to terminate their attorney and switch firms, and persistent non-responsiveness (four unreturned voicemails, a case that feels stalled) is a legitimate, common reason to do so — this isn't a case of \"I just want a better deal,\" it's a breakdown in communication.",
    "reason": "QUALIFIED, contingent on Cassandra formally terminating her relationship with the current firm. Help her understand the termination process (typically a short letter notifying the firm she is ending the representation) so the switch is done properly. Once that's done, the underlying case — clean liability, active insurance, consistent treatment — is straightforwardly qualified."
  },
  {
    "id": "n20-2",
    "num": "19.2",
    "title": "Consulted a Firm That Declined, No Retainer Signed",
    "category": "Procedural & Status",
    "disposition": "escalate",
    "story": "The caller is Phillip Esposito, the driver — right person. The accident happened 10 days ago — Phillip was rear-ended, defendant cited, insurance active, treating with a chiropractor since day 4, no gaps. Phillip mentions, \"I actually talked to another law firm a couple days after the accident — they had me explain everything, but then they said they weren't going to be able to take it and to look elsewhere. I never signed anything with them.\" When the rep asks why they passed, Phillip says, \"Honestly they didn't really explain much, just said it wasn't a good fit for them.\"",
    "nuance": "A consultation without a signed retainer is not a \"prior attorney\" in the sense that would disqualify the case — Phillip never became their client. But the decline reason matters: firms generally don't pass on clean rear-ends with active insurance for no reason — something in the file likely gave them pause, even if Phillip can't articulate what it was. \"They didn't really explain much\" doesn't mean nothing is there; it may just mean Phillip wasn't told, or wasn't listening for, the actual reason.",
    "reason": "ESCALATE. The facts as told (cited rear-end, active insurance, consistent treatment, no gaps) look qualified — but a firm declining a case it consulted on is itself a data point, and there's usually a reason behind it even when the PC can't repeat it back. Flag this for the manager before signing, and if possible find out which firm it was and what they were told, so the same issue doesn't surface later as a surprise."
  },
  {
    "id": "n20-3",
    "num": "19.3",
    "title": "Possible Settlement Signed, Catastrophic Injuries, Unconfirmed",
    "category": "Procedural & Status",
    "disposition": "not_qualified",
    "story": "The caller is Michelle Thomas, the driver — right person. The accident happened about 3 months ago. Michelle describes a serious accident — hospitalized, with a fractured back, two pelvic fractures, and a head laceration. About two weeks ago, Michelle says, \"the insurance company offered me $30,000, and I told them I'd take it. I signed some paperwork online, and I got some money — I think it was already deposited — but it ended up being way less than $30,000 after some deductions I didn't really understand.\" Michelle had no attorney at the time and handled this herself. She's still in significant pain and still treating.",
    "nuance": "A signed settlement plus a cashed/deposited check usually ends a claim. But \"I told them I'd take it... signed some paperwork online... I think it was already deposited\" — without Michelle being able to say definitively whether what she signed was a full settlement of all claims — paired with catastrophic-level injuries (fractured back, pelvic fractures, head laceration) is an attorney question, not a rep rejection and absolutely not a rep sales pitch promising more money.",
    "reason": "Likely NOT QUALIFIED if a full settlement was signed and funds accepted — but URGENT ESCALATION regardless, because the settlement status is unconfirmed and the injuries are catastrophic. The rep's only job is gathering whatever documents/emails Michelle has and being honest that this needs attorney review, without promising the settlement can be reopened or that more money is coming."
  },
  {
    "id": "n20-4",
    "num": "19.4",
    "title": "PD Check Already Cashed, BI Claim Untouched",
    "category": "Procedural & Status",
    "disposition": "qualified",
    "story": "The caller is Tom Whitfield, the driver — right person. The accident happened 5 weeks ago. Tom was rear-ended at a red light; the other driver was cited for following too closely, and the other driver's insurance (Nationwide) accepted liability quickly. About two weeks after the accident, Nationwide's adjuster called Tom, said they were \"processing the property damage portion,\" had him confirm his bank details, and a check arrived about a week later — Tom says, \"I got a check for like $3,400, I think that was for the car repairs, I cashed it and got the bumper and the trunk fixed.\" When the rep asks whether Tom signed anything releasing his claim or received any separate paperwork about his INJURIES, Tom says, \"No, nothing like that — they never asked about how I was feeling, it was all just about the car. I actually still haven't told them about my back, which has been bothering me since the accident — I went to a chiropractor starting about 10 days after the accident and I'm still going twice a week.\"",
    "nuance": "\"I already got a check from the insurance company and cashed it\" is the phrase that makes reps assume a case is dead. But the criteria treats property damage and bodily injury as separate claims. Tom's description is unambiguous: the $3,400 was specifically for vehicle repairs, no release was signed, and the insurer never discussed — let alone settled — his injury claim. His chiropractic treatment, started within the 30-day window and ongoing, is an entirely separate, still-open matter.",
    "reason": "QUALIFIED. The prior payment covered property damage only — Tom did not sign a release of his bodily injury claim, and the insurer never addressed his injuries. His BI claim remains fully open: clear liability (cited defendant, accepted by insurer), injury, and treatment within 30 days with no gaps. The attorney should still verify the scope of whatever paperwork Tom signed for the PD payment."
  },
  {
    "id": "n20-5",
    "num": "19.5",
    "title": "Recorded Statement Already Given to Defendant's Insurer",
    "category": "Procedural & Status",
    "disposition": "screen",
    "story": "The caller is Bridget Halvorsen, the driver — right person. The accident happened 8 days ago — rear-ended at a light, defendant cited, insurance (Farmers) active. Bridget has neck pain, treated within the week, no gaps. Partway through the call, Bridget says, anxiously, \"I think I messed up — the other driver's insurance company called me a couple days after the accident and asked me a bunch of questions, and I answered everything. They recorded it. Did I ruin my case by talking to them?\"",
    "nuance": "A recorded statement is not a listed disqualifier under the criteria — it's a fact to document, not a death sentence. The rep should neither dismiss Bridget's concern entirely nor catastrophize it; the right response is calm, factual, and focused on capturing what was actually said.",
    "reason": "Screen normally — the case otherwise QUALIFIES (cited rear-end, active insurance, injury/treatment within 30 days). Note that a recorded statement was given and ask Bridget what she recalls saying about fault and injuries, so it can be documented for the file. This affects strategy, not intake eligibility."
  },
  {
    "id": "n20-6",
    "num": "19.6",
    "title": "The Suspiciously Fluent Caller",
    "category": "Procedural & Status",
    "disposition": "screen",
    "story": "The caller is identified only as \"J. Reyes.\" From the first sentence, the caller answers in clipped, complete-sounding phrases: \"Clear liability rear-end, the other driver was cited, their insurance is active, I treated within 30 days with no gaps, and I've never had an attorney for this.\" When the rep, slightly thrown by how pre-packaged this sounds, asks an open-ended follow-up — \"Can you just walk me through what happened that day, from the beginning?\" — the caller hesitates, then gives a vague, generalized account: \"I was driving, and then I got hit from behind, and then... yeah, that's basically it.\" When asked for the name of the chiropractor or urgent care they saw, the caller says, \"I don't remember the exact name, it's written down somewhere.\"",
    "nuance": "Every checklist item was recited in criteria language almost before being asked — PCs rejected elsewhere sometimes learn the script. The mismatch between the confident keyword recitation and the vague, detail-free open-ended retelling (no provider names, no specific sequence of events) is the actual signal here.",
    "reason": "Screen on VERIFIED facts, not recited keywords. Do not disposition based on the opening recitation alone. Continue with open-ended, detail-seeking questions (exact dates, provider names, the sequence of events in the caller's own words) and base the disposition on what those answers — and any documents the caller can actually produce — support."
  },
  {
    "id": "n20-7",
    "num": "19.7",
    "title": "Multiple Disqualifiers Stacked in One Call",
    "category": "Procedural & Status",
    "disposition": "not_qualified",
    "story": "The caller is Desmond Carrow, the driver — right person. The accident happened 6 days ago. Desmond describes being hit by \"a postal truck\" — on questioning, confirmed to be a USPS vehicle, driver on duty delivering mail (federal — see Part 7). Separately, Desmond's own account of how the accident happened reveals he was the one who made an unprotected left turn directly in front of the mail truck, which was going straight (PC at fault — see Part 2). On top of that, Desmond says he hasn't sought any treatment yet for the soreness he's felt, and when asked if he'd be willing to, says \"probably not, I don't really like doctors\" (treatment refusal — see Part 14).",
    "nuance": "Three independent disqualifiers in one call: federal defendant (USPS), PC at fault (unprotected left turn), and refusal to treat. Some reps feel compelled to walk the caller through every single issue, debating each one. The disposition only needs the cleanest, most absolute disqualifier — but the FILE should document all three for the record, in case any one of them is later disputed or clarified.",
    "reason": "NOT QUALIFIED. Communicate the simplest, most absolute reason to the caller (federal/USPS defendant — not accepted under any circumstances). Document all three issues (federal defendant, PC's own account placing them at fault for an unprotected left turn, and refusal to treat) in the file for completeness, even though any one of them alone would be sufficient."
  },
  {
    "id": "n21-1",
    "num": "20.1",
    "title": "The Four Checks That Decide Every Case",
    "category": "The Master Principles Behind Every Call",
    "disposition": "qualified",
    "story": "A rep takes a call. The caller describes an accident — any type, any state, any injury level. Before reaching for \"qualified\" or \"not qualified,\" the rep should be able to answer four questions, regardless of how the story was told: (1) Is the PC the plaintiff and not at fault — based on their own story, the police report, and any independent evidence? (2) Is the PC injured, did they begin treatment within the required window for that case type (30 days for auto/ped/bike/motorcycle; same/next day for slip & fall; first few days for premise), and — if the case is older — have they avoided gaps of 30+ days? (3) Is there insurance to PURSUE — defendant coverage, or the PC's UM if the defendant has none (and only if the PC is not at fault)? And (4) — for California auto cases specifically — was the PC DRIVER themselves an insured driver on the date of loss (Prop 213)?",
    "nuance": "Checks 3 and 4 are both \"insurance,\" but they answer different questions: #3 is \"is there money on the other side,\" #4 is \"is the PC even eligible to recover under CA law.\" A case can pass #3 — the defendant is fully insured and has accepted liability — and still fail #4 if the PC driver had no policy of their own on the DOL. Confirming \"the other guy has insurance\" answers #3 only; it says nothing about #4. Every CA auto case with a PC driver needs both confirmed separately.",
    "reason": "A case is QUALIFIED only when ALL FOUR checks hold AND no case-type exception applies on top of them — household passenger exceptions (spouse/minor child/person you live with), government immunity and SOL clocks (6 months CA, 2 years NV), federal defendant exclusions (USPS), big-injury requirements (government claims, city/sidewalk, bus-as-defendant, places of entertainment, non-bite dog injuries), state-specific minor rules (CA/NV include regardless of injury with a signing injured adult; CO requires injury+treatment; WA excludes under-17 soft tissue), and venue-specific exclusions (CA casinos). When a single fact is missing — UM status unconfirmed, release scope unclear, intersection arrow unverified — the disposition is CONDITIONAL until that fact is obtained. When the criteria itself says to consult (catastrophic injury/death on an at-fault left turn, big-injury gap exceptions, places of entertainment, approaching SOLs), the disposition is ESCALATE — never a solo rep-level reject OR sign in those situations."
  }
]

export const CATEGORIES = Array.from(new Set(NUANCE_SCENARIOS.map((s) => s.category)))

export function getNuanceScenario(id: string): NuanceScenario | undefined {
  return NUANCE_SCENARIOS.find((s) => s.id === id)
}

/**
 * Weighted random scenario, avoiding anything the rep has seen recently. Falls
 * back to the full pool once they have worked through everything.
 *
 * Weights come from the caller (admin-tunable); an unweighted call is uniform,
 * which is only used by tooling.
 */
export function randomScenario(
  opts: {
    exclude?: string[]
    category?: string
    weightOf?: (s: NuanceScenario) => number
  } = {}
): NuanceScenario {
  const { exclude = [], category, weightOf } = opts
  let pool = category ? NUANCE_SCENARIOS.filter((s) => s.category === category) : NUANCE_SCENARIOS
  const fresh = pool.filter((s) => !exclude.includes(s.id))
  if (fresh.length > 0) pool = fresh

  if (!weightOf) return pool[Math.floor(Math.random() * pool.length)]

  const weights = pool.map(weightOf)
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)]

  let r = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}
