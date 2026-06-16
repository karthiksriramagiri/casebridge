import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface QuestionSeed {
  question_text: string
  options: { option_text: string; is_correct: boolean }[]
}

const QUESTIONS: QuestionSeed[] = [
  // ── REAR-END ──────────────────────────────────────────────────────────────
  {
    question_text:
      'A 34-year-old woman calls and explains that she was fully stopped at a red light on Eastern Avenue when the sedan behind her failed to brake and rear-ended her at approximately 30 mph. Her vehicle sustained visible rear-end damage and the striking vehicle\'s airbags deployed. She went to the emergency room that same evening where she was diagnosed with cervical and lumbar strain and given muscle relaxers. She has been attending a chiropractic clinic three times per week for the past 12 days and says her neck is still very sore. The defendant\'s insurer has already accepted liability in writing. What is the disposition?',
    options: [
      { option_text: 'Qualified — clean rear-end with same-day ER, consistent chiropractic, and liability accepted by defendant\'s insurer', is_correct: true },
      { option_text: 'Not Qualified — she needs to wait 30 days before calling to file a claim', is_correct: false },
      { option_text: 'Conditional — must first confirm the defendant\'s policy has not lapsed', is_correct: false },
      { option_text: 'Escalate — all rear-end accidents with ER visits require supervisor review', is_correct: false },
    ],
  },
  {
    question_text:
      'A 45-year-old man calls about an accident that happened three days ago. He was stopped at a traffic light when a car bumped his vehicle from behind. He says neither vehicle has any visible damage — not even a scratch — but he woke up the next morning with significant stiffness and soreness in his neck and upper back. He saw his primary care doctor two days later, who noted cervical muscle spasm and referred him to physical therapy. The defendant is insured and a police report was filed. What is the disposition?',
    options: [
      { option_text: 'Conditional — zero visible damage on both vehicles is a soft liability issue that requires supervisory review', is_correct: true },
      { option_text: 'Qualified — injury alone qualifies him regardless of property damage', is_correct: false },
      { option_text: 'Not Qualified — no visible damage to either vehicle means there is no valid case', is_correct: false },
      { option_text: 'Escalate — zero-damage soft tissue cases must go to a senior attorney immediately', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller says she was "rear-ended" and wants to know if she has a case. As the intake proceeds, she discloses that all of the damage on her vehicle is on the front bumper — not on the rear. She says the other car "came from behind" but cannot explain how only her front bumper got damaged. She becomes evasive when asked follow-up questions about the direction of impact and whether she may have backed into something. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — front-end damage directly contradicts a rear-end claim; the account is inconsistent and not credible', is_correct: true },
      { option_text: 'Qualified — we take the caller\'s account at face value during intake', is_correct: false },
      { option_text: 'Conditional — accept the case but flag the damage discrepancy for attorney review', is_correct: false },
      { option_text: 'Escalate — damage location conflicts must be resolved by a supervisor before disposition', is_correct: false },
    ],
  },
  {
    question_text:
      'A 29-year-old woman was the middle car of three vehicles stopped at a red light on Tropicana Avenue when a pickup truck traveling at high speed failed to brake and struck the car behind her, pushing that car into our caller\'s vehicle, which was then pushed into the car ahead of her. She did not brake suddenly or take any action that contributed to the accident — the chain reaction started from behind. She has photos of rear damage to her car and was transported by ambulance to Sunrise Hospital with a concussion and neck injury. The police report cites the rear pickup truck driver as at fault. What is the disposition?',
    options: [
      { option_text: 'Qualified — she was pushed by the at-fault rear driver and bears no fault for the chain reaction', is_correct: true },
      { option_text: 'Not Qualified — she struck the car in front of her and is a contributing party to the accident', is_correct: false },
      { option_text: 'Conditional — chain-reaction accidents are inherently shared-fault and require supervisor review', is_correct: false },
      { option_text: 'Escalate — three-vehicle accidents require a supervisor before intake is completed', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller says he was rear-ended while stopped in traffic on I-15. During intake he admits that he had been intentionally brake-checking the driver behind him for several miles because the driver had been tailgating him aggressively. He says the tailgating driver finally rear-ended him when he brake-checked once more. He claims he has a dashcam that captured the entire highway interaction, including the extended tailgating that preceded the crash. Both vehicles sustained damage and he reports back pain. What is the disposition?',
    options: [
      { option_text: 'Escalate — intentional brake-checking with documented provocation requires attorney evaluation before intake', is_correct: true },
      { option_text: 'Not Qualified — intentional brake-checking makes him the at-fault party in all circumstances', is_correct: false },
      { option_text: 'Qualified — the defendant rear-ended him regardless of what preceded it, making defendant fully liable', is_correct: false },
      { option_text: 'Conditional — accept only if the dashcam footage shows the tailgating began more than five minutes prior', is_correct: false },
    ],
  },
  // ── LEFT TURN ─────────────────────────────────────────────────────────────
  {
    question_text:
      'A 52-year-old man calls about a collision at the intersection of Sahara and Decatur. He was driving straight through the intersection on a solid green light when the opposing vehicle made an unprotected left turn directly in front of him, giving him no time to react. The impact deployed his front airbag and totaled his vehicle. He was transported by ambulance to Desert Springs Hospital with chest contusions from the airbag and left shoulder pain. The police report documents the defendant made an improper left turn and confirms the caller had the right of way. The defendant is insured with Progressive. What is the disposition?',
    options: [
      { option_text: 'Qualified — defendant made an unprotected left turn in front of a straight-traveling driver with the green; liability is clear', is_correct: true },
      { option_text: 'Not Qualified — intersection accidents involving a left turn are inherently shared fault', is_correct: false },
      { option_text: 'Conditional — must confirm the caller was not also exceeding the speed limit at the time of impact', is_correct: false },
      { option_text: 'Escalate — airbag-deployment accidents with totaled vehicles always require supervisor approval', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller says she was making an unprotected left turn at an intersection when a vehicle traveling straight through struck her driver\'s side door. She admits she was the one turning left. She claims the light was yellow when she initiated the turn and insists she had enough time to complete it. There are no witnesses and no traffic cameras at this intersection. The other driver, who was not cited, says the light was green in his favor when the collision happened. She has soft tissue injuries only. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the caller made the unprotected left turn and is the at-fault party; no evidence contradicts the straight-traveling driver\'s account', is_correct: true },
      { option_text: 'Qualified — a yellow light gives a turning driver the right to proceed and complete the turn', is_correct: false },
      { option_text: 'Conditional — accept if she can locate a witness or nearby surveillance camera to corroborate her account', is_correct: false },
      { option_text: 'Escalate — disputed fault in left-turn intersection accidents requires supervisor determination', is_correct: false },
    ],
  },
  {
    question_text:
      'A family is calling on behalf of a 26-year-old woman who was killed in a collision. She was a passenger in a vehicle driven by her boyfriend. The boyfriend made an unprotected left turn at a busy intersection and was struck by an oncoming car traveling straight. Both the boyfriend and our caller\'s family member were killed in the accident. Liability rests with the boyfriend who initiated the left turn. The family wants to know if they can pursue a wrongful death claim for the deceased passenger. What is the disposition?',
    options: [
      { option_text: 'Escalate — wrongful death of a passenger in an at-fault vehicle involves complex exception analysis and requires attorney review before any determination', is_correct: true },
      { option_text: 'Not Qualified — the at-fault driver\'s passengers can never recover when the driver caused the accident', is_correct: false },
      { option_text: 'Qualified — passengers always have independent recovery rights regardless of the driver\'s fault', is_correct: false },
      { option_text: 'Conditional — proceed only if the family can establish the passenger had no knowledge the driver would turn unsafely', is_correct: false },
    ],
  },
  // ── MERGE / SIDESWIPE ────────────────────────────────────────────────────
  {
    question_text:
      'A 38-year-old woman calls about a sideswipe that occurred on US-95 northbound. She had been traveling in the center lane for approximately two miles when a vehicle in the left lane drifted sideways without signaling and scraped along the entire driver\'s side of her vehicle. She maintained her lane position throughout and never moved left. A police report was taken and the officer cited the other driver for failure to maintain lane. She has been treating for left shoulder and hip pain at a physical therapy clinic three times a week. The defendant is insured with GEICO. What is the disposition?',
    options: [
      { option_text: 'Qualified — caller was in an established lane, held position, and the defendant was cited for drifting into her', is_correct: true },
      { option_text: 'Not Qualified — sideswipes are inherently shared-fault accidents on the freeway', is_correct: false },
      { option_text: 'Conditional — need to verify she was in the center lane for the required minimum distance before the sideswipe', is_correct: false },
      { option_text: 'Escalate — freeway sideswipe accidents always require supervisor review before intake', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller says he was involved in a sideswipe accident this morning on Interstate 15. He was merging onto the freeway from a northbound on-ramp when a vehicle already in the travel lane struck his passenger side as he attempted to merge. He admits he was the one entering the freeway from the ramp. He says he "thought he had enough room." There is minor damage to both vehicles and he has neck soreness. The defendant disputes the account and says our caller merged without checking mirrors. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the caller was the merging vehicle; vehicles on an on-ramp must yield to established freeway traffic', is_correct: true },
      { option_text: 'Qualified — the travel-lane driver had a duty to allow adequate space for merging vehicles', is_correct: false },
      { option_text: 'Conditional — accept only if a witness or camera confirms the freeway driver was exceeding the speed limit', is_correct: false },
      { option_text: 'Escalate — all highway merge accidents go to a supervisor before disposition', is_correct: false },
    ],
  },
  // ── TRAFFIC LIGHT DISPUTES ───────────────────────────────────────────────
  {
    question_text:
      'A 44-year-old woman calls about an accident at the intersection of Charleston and Rainbow. She says she had a solid green light when a vehicle ran the red from the cross-street and T-boned her on the driver\'s side. She was transported by ambulance to Valley Hospital with rib fractures and a broken wrist. The police report includes a statement from an independent pedestrian witness — not affiliated with either driver — standing at the crosswalk who confirms our caller had the green light. The defendant is insured with Liberty Mutual. What is the disposition?',
    options: [
      { option_text: 'Qualified — independent witness on the police report resolves the light dispute in the caller\'s favor; serious injuries and clear liability', is_correct: true },
      { option_text: 'Not Qualified — light disputes can never be accepted without traffic camera footage', is_correct: false },
      { option_text: 'Conditional — must obtain a photo of the damaged traffic signal before proceeding', is_correct: false },
      { option_text: 'Escalate — T-bone accidents with fractures must go to a supervisor before intake', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller says he had the green light when the opposing driver ran the red and hit him at an intersection. The other driver is also telling his insurer he had the green light. There are no cameras at this intersection, no police were called because both drivers agreed to exchange information privately, and the caller\'s dashcam was not pointed at the signal. No independent witnesses stopped. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — an unresolvable he-said/she-said light dispute with no witnesses, no cameras, and no police report means liability cannot be established', is_correct: true },
      { option_text: 'Qualified — we accept the caller\'s account of the signal during intake', is_correct: false },
      { option_text: 'Conditional — ask the caller to canvass nearby businesses for security footage before making a final determination', is_correct: false },
      { option_text: 'Escalate — tied liability situations require a supervisor to break the deadlock', is_correct: false },
    ],
  },
  {
    question_text:
      'A 31-year-old man was driving eastbound on Warm Springs Road when a vehicle pulling out from a residential side street that had a clearly posted stop sign ran the stop sign and pulled directly into his path, striking his front passenger side. He had the right of way on the main boulevard and had no time to brake before impact. The police report lists the side street driver as having failed to obey the stop sign and not yielding. He was treated at urgent care the same day for lower back strain and a forearm laceration. What is the disposition?',
    options: [
      { option_text: 'Qualified — defendant failed to obey a stop sign and crossed into a boulevard driver\'s right of way; liability is documented in the police report', is_correct: true },
      { option_text: 'Not Qualified — boulevard vs. side street conflicts are inherently shared-liability situations', is_correct: false },
      { option_text: 'Conditional — must independently confirm the stop sign was fully visible and unobstructed at the time', is_correct: false },
      { option_text: 'Escalate — right-of-way disputes at intersections always need supervisor review', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller wants to file a personal injury claim. During intake she reveals she was the one pulling out of a private driveway onto a busy main road when an oncoming vehicle struck her passenger door. She admits she "didn\'t see the car coming" before she pulled forward into traffic. She has soft tissue injuries to her neck and her car has significant passenger-side damage. The other driver did not receive a citation because the officer found our caller at fault. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the caller pulled out of a driveway and failed to yield to oncoming traffic; she is the at-fault party per the police determination', is_correct: true },
      { option_text: 'Qualified — driveways and main roads share an equal right of way under traffic law', is_correct: false },
      { option_text: 'Conditional — can proceed if the oncoming driver was demonstrably exceeding the speed limit at the time of impact', is_correct: false },
      { option_text: 'Escalate — single-fault driveway accidents must go to a supervisor before any determination', is_correct: false },
    ],
  },
  // ── GOVERNMENT VEHICLES ──────────────────────────────────────────────────
  {
    question_text:
      'A caller says she was driving through an intersection when a city police cruiser with its lights and sirens fully activated entered the same intersection on red and struck her vehicle on the driver\'s side. She has soft tissue injuries and her car is totaled. We confirm she carries liability-only coverage — no UM, no MedPay, no UIM — on her auto insurance policy. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — government emergency vehicles operating with active lights and sirens have statutory right of way; without UM coverage there is no viable recovery path', is_correct: true },
      { option_text: 'Qualified — the police cruiser entered on a red light and the city is still responsible for damages', is_correct: false },
      { option_text: 'Conditional — accept if the officer\'s use of the intersection was later deemed unreasonable by an internal review', is_correct: false },
      { option_text: 'Escalate — all accidents involving law enforcement vehicles must go to a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was stopped at a green light on Maryland Parkway when a police cruiser running full lights and sirens entered the intersection and struck another vehicle that was crossing on red. That struck vehicle was pushed sideways into our caller\'s car, causing his vehicle to spin and hit the curb. The caller had a legal green light and no involvement in the first impact. He was treated at UMC for whiplash and a fractured wrist. What is the disposition?',
    options: [
      { option_text: 'Qualified — the caller was an uninvolved third party hit in a secondary impact; the government vehicle\'s right-of-way exception does not extend to a downstream collision with an unrelated party', is_correct: true },
      { option_text: 'Not Qualified — any accident that originates from a police vehicle running lights and sirens disqualifies all downstream claims', is_correct: false },
      { option_text: 'Conditional — qualified only if the caller also carries UM coverage on his own policy', is_correct: false },
      { option_text: 'Escalate — any accident connected to a law enforcement vehicle requires supervisor review before disposition', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was rear-ended by a city water department truck approximately five and a half months ago in California. He has a police report, medical records documenting his injuries, and a witness who saw the collision. He is calling us for the first time today. He is aware the driver was a city employee. California Government Code requires claims against a government entity be filed within six months of the incident. What is the disposition?',
    options: [
      { option_text: 'Escalate — five and a half months against a California government entity means the six-month SOL deadline is weeks away; this requires immediate urgent attorney review', is_correct: true },
      { option_text: 'Qualified — five months is comfortably within the standard two-year personal injury statute of limitations', is_correct: false },
      { option_text: 'Not Qualified — city-owned vehicle accidents are never actionable as personal injury claims', is_correct: false },
      { option_text: 'Conditional — accept if the caller has already submitted a written complaint to the city in the past', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was rear-ended while stopped at a delivery zone on a busy Las Vegas street. The driver who struck him was operating a clearly marked white USPS mail truck making scheduled deliveries on his route. The caller has neck and back pain and started treating at a chiropractor three days after the accident. A police report was taken at the scene identifying the USPS driver. He wants to know if we can take his case and how to file a claim. What is the disposition?',
    options: [
      { option_text: 'Escalate — USPS is a federal government entity subject to special claim procedures under the Federal Tort Claims Act; do not accept or reject unilaterally — needs attorney handling', is_correct: true },
      { option_text: 'Not Qualified — federal government vehicles carry absolute immunity from all personal injury claims', is_correct: false },
      { option_text: 'Qualified — treat this the same as any other commercial delivery vehicle claim and proceed with intake', is_correct: false },
      { option_text: 'Conditional — accept only if the police report explicitly cites the USPS driver for the collision', is_correct: false },
    ],
  },
  {
    question_text:
      'A 67-year-old man was a passenger on an RTC public bus traveling southbound on Maryland Parkway when a private vehicle ran a stop sign and struck the bus on the driver\'s side. The bus driver was not at fault. Our caller was thrown from his seat and struck a metal railing on his shoulder. He was transported by ambulance to Valley Hospital where he was treated for a shoulder contusion and referred to orthopedics. The at-fault car driver is identified and carries active State Farm insurance. What is the disposition?',
    options: [
      { option_text: 'Qualified — a third-party vehicle caused the accident and is clearly liable; the bus passenger has a direct claim against the at-fault car driver', is_correct: true },
      { option_text: 'Not Qualified — bus passengers can only recover through the transit authority\'s insurance program', is_correct: false },
      { option_text: 'Conditional — must verify the transit authority will cooperate with discovery and subpoenas', is_correct: false },
      { option_text: 'Escalate — all transit-related accidents require supervisor review regardless of fault', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was riding as a passenger on a city bus when the bus driver made a hard emergency stop to avoid a vehicle that pulled directly in front of the bus. No collision occurred — the bus successfully avoided the other car. However, the caller was standing in the aisle at the time and was thrown forward, striking a metal pole and injuring her wrist. She wants to know if the car that cut off the bus is responsible for her injury. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — no collision occurred; an injury from an emergency bus stop with no impact does not constitute a valid auto accident personal injury claim', is_correct: true },
      { option_text: 'Qualified — the car that cut off the bus acted negligently and indirectly caused her injury', is_correct: false },
      { option_text: 'Conditional — accept if the bus company confirms the stop was unreasonably sharp given the conditions', is_correct: false },
      { option_text: 'Escalate — bus incidents involving passenger falls without a collision go to a supervisor', is_correct: false },
    ],
  },
  // ── HOUSEHOLD MEMBER EXCLUSION ───────────────────────────────────────────
  {
    question_text:
      'A caller says her husband was driving their shared vehicle and ran a stop sign, causing an accident. She was in the passenger seat and was injured. She and her husband have been married for six years and live together at the same address. They share the same auto insurance policy. She wants to know if she can file a claim against her husband\'s insurance for her injuries from the crash he caused. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the at-fault driver is her husband and they share the same household; the household member exclusion bars recovery under his liability coverage', is_correct: true },
      { option_text: 'Qualified — spouses can sue each other for negligence under general tort law in all states', is_correct: false },
      { option_text: 'Conditional — proceed if she files first under her own MedPay coverage before pursuing liability', is_correct: false },
      { option_text: 'Escalate — all accidents between married couples require supervisor determination on the exclusion', is_correct: false },
    ],
  },
  {
    question_text:
      'A 24-year-old man was a passenger in a car driven by his coworker and longtime friend. The friend ran a red light and caused the collision. Our caller and the driver are not related, have never lived together, and have no financial relationship. Our caller was treated at urgent care the same day with soft tissue injuries to his neck and lower back. The friend carries active auto liability insurance. What is the disposition?',
    options: [
      { option_text: 'Qualified — the driver is not a household member; the caller as a passenger can recover from the at-fault driver\'s liability coverage', is_correct: true },
      { option_text: 'Not Qualified — passengers cannot file personal injury claims against the driver of the vehicle they were riding in', is_correct: false },
      { option_text: 'Conditional — must first confirm the friend\'s liability policy is active and has adequate limits', is_correct: false },
      { option_text: 'Escalate — all passenger-versus-driver cases require attorney review before intake', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller says his fiancée was driving when she caused an accident and he was injured as a passenger. They are engaged. However, he lives in his own apartment in Henderson and she lives in her own apartment in Summerlin — they have separate leases, separate addresses, and are not yet legally married. The fiancée carries active auto insurance. He has soft tissue injuries. What is the disposition?',
    options: [
      { option_text: 'Qualified — they do not share a household; the household member exclusion does not apply regardless of their relationship status', is_correct: true },
      { option_text: 'Not Qualified — engaged couples are treated as household members the same as legally married couples for insurance purposes', is_correct: false },
      { option_text: 'Not Qualified — any romantic partner is automatically considered a household member under liability exclusions', is_correct: false },
      { option_text: 'Conditional — depends on how long they have been living separately and whether they share any finances', is_correct: false },
    ],
  },
  {
    question_text:
      'A 58-year-old woman calls about an accident caused by her son. Her son, who is 26 years old, caused a rear-end collision while she was riding as a passenger. They live at the same address — her son moved back home after college and is listed on her auto insurance policy. She was treated at urgent care for cervical strain and now wants to file a claim through her son\'s insurance. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the at-fault son shares the same household as the caller; the household member exclusion applies regardless of the son\'s age', is_correct: true },
      { option_text: 'Qualified — adult children are legally independent individuals even if they currently live with their parents', is_correct: false },
      { option_text: 'Conditional — depends on whether the son is listed as a primary or secondary driver on the household policy', is_correct: false },
      { option_text: 'Escalate — parent-child accidents always require supervisor review on the household exclusion question', is_correct: false },
    ],
  },
  {
    question_text:
      'A 56-year-old woman was a passenger in her 23-year-old daughter\'s car when the daughter rear-ended another vehicle. The caller has soft tissue injuries to her neck and back and has been treating at a chiropractor three times a week. The daughter lives independently in her own apartment in Henderson and has her own separate lease and auto insurance policy — she has not lived with her mother in two years. What is the disposition?',
    options: [
      { option_text: 'Qualified — the daughter does not reside with the caller; the household exclusion does not apply', is_correct: true },
      { option_text: 'Not Qualified — any parent-child relationship triggers the household exclusion regardless of where each party currently lives', is_correct: false },
      { option_text: 'Conditional — must confirm the daughter has been living independently for at least 12 consecutive months before the exclusion can be ruled out', is_correct: false },
      { option_text: 'Escalate — family member accidents require supervisor determination on whether the household exclusion applies', is_correct: false },
    ],
  },
  // ── RIDESHARE ─────────────────────────────────────────────────────────────
  {
    question_text:
      'A caller was riding as a passenger in an Uber on the Las Vegas Strip when a vehicle ran a red light and slammed into the passenger side of the Uber. The Uber driver had the green light and is not at fault. Our caller was transported by ambulance to Sunrise Hospital with a broken collarbone and facial lacerations. The at-fault vehicle is identified and insured through Farmers Insurance. The Uber app confirms the trip was in active status at the time of the crash. What is the disposition?',
    options: [
      { option_text: 'Qualified — a third-party vehicle is at fault; the caller has a direct claim against the at-fault driver and Uber\'s commercial policy is a secondary resource', is_correct: true },
      { option_text: 'Not Qualified — Uber passengers can only recover through Uber\'s commercial insurance program, not the at-fault driver', is_correct: false },
      { option_text: 'Conditional — must confirm Uber\'s commercial policy was in active trip status before any intake can proceed', is_correct: false },
      { option_text: 'Escalate — all rideshare-involved accidents require supervisor review regardless of fault', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller says he was riding in an Uber late at night when the Uber driver, with no other vehicle involved, drifted off the freeway and struck a concrete barrier. The driver had fallen asleep at the wheel. Our caller sustained significant head lacerations, a broken nose, and is currently hospitalized. The Uber app confirms the trip was in active status at the time of the single-vehicle crash. What is the disposition?',
    options: [
      { option_text: 'Qualified — Uber maintains substantial commercial insurance covering passenger injuries even in single-vehicle crashes when the trip is active', is_correct: true },
      { option_text: 'Not Qualified — there is no third-party defendant in a single-car accident, so there is no viable personal injury claim', is_correct: false },
      { option_text: 'Conditional — depends on whether the Uber driver was confirmed asleep by a toxicology report or dashcam footage', is_correct: false },
      { option_text: 'Not Qualified — the caller would need to sue the Uber driver personally, which is outside our intake scope', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was a passenger in an Uber when a car cut in front of the Uber on the freeway without warning. The Uber driver braked hard to avoid a collision and was successful — no contact occurred between the two vehicles. The caller, who was not wearing a seatbelt, slid forward in the back seat and struck the front seat, injuring his knee. He wants to know if the car that cut them off is responsible for his injury. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — no collision occurred; a hard brake with no vehicle contact does not constitute a valid auto accident personal injury claim', is_correct: true },
      { option_text: 'Qualified — the car that cut off the Uber was negligent and is the proximate cause of the injury', is_correct: false },
      { option_text: 'Conditional — accept if the caller seeks medical treatment and the Uber\'s dashcam captured the offending vehicle\'s plate', is_correct: false },
      { option_text: 'Escalate — rideshare braking incidents without collision go to a supervisor for case evaluation', is_correct: false },
    ],
  },
  // ── PEDESTRIANS ───────────────────────────────────────────────────────────
  {
    question_text:
      'A 71-year-old woman was walking in a painted crosswalk at the corner of Flamingo and Koval Lane. She had the pedestrian walk signal illuminated and was halfway across the street when a vehicle making a right turn on a red light struck her, throwing her to the ground. She was transported by ambulance to UMC where she was admitted overnight with a fractured hip and head lacerations. The driver stopped, is identified, and carries active Liberty Mutual insurance. What is the disposition?',
    options: [
      { option_text: 'Qualified — pedestrian had the walk signal in a marked crosswalk; driver failed to yield on a right turn; liability and serious injuries are both clear', is_correct: true },
      { option_text: 'Not Qualified — pedestrians in the roadway are always partially at fault for not watching for turning vehicles', is_correct: false },
      { option_text: 'Conditional — must confirm the crosswalk paint was clearly visible and properly maintained before accepting', is_correct: false },
      { option_text: 'Escalate — all pedestrian accidents involving fractures require supervisor escalation before intake', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was walking his dog on a residential sidewalk when a car veered onto the sidewalk and struck him before speeding away. The driver fled and has not been identified despite a police investigation. Our caller does not own a vehicle, does not have any auto insurance policy, and does not live with anyone who carries auto insurance. He relies exclusively on public transit. He was treated at the ER for a fractured leg. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the driver fled and is unidentified, and the caller has no UM coverage of any kind; there is no viable path to recover damages', is_correct: true },
      { option_text: 'Qualified — pedestrian hit-and-run cases can always proceed regardless of whether the victim has UM coverage', is_correct: false },
      { option_text: 'Conditional — check if any household members have an auto insurance policy with UM coverage that could extend to him', is_correct: false },
      { option_text: 'Escalate — all hit-and-run pedestrian accidents require supervisor review before any determination is made', is_correct: false },
    ],
  },
  // ── BICYCLES ──────────────────────────────────────────────────────────────
  {
    question_text:
      'A 33-year-old cyclist was riding in the bike lane on East Charleston Boulevard when an occupant of a parked car swung the driver\'s door open directly into his path without looking. He was thrown over the door, landed on the asphalt, and sustained a fractured wrist and significant road rash on his left arm and shoulder. He was transported by ambulance. The car occupant is identified, insured, and has admitted she did not check her mirror before opening the door. What is the disposition?',
    options: [
      { option_text: 'Qualified — dooring is the car occupant\'s fault; occupants have a legal duty to check for cyclists before opening their door into traffic', is_correct: true },
      { option_text: 'Not Qualified — bicyclists are responsible for anticipating and avoiding car doors when riding near parked vehicles', is_correct: false },
      { option_text: 'Conditional — liability depends on whether the cyclist was in a formally designated and marked bike lane', is_correct: false },
      { option_text: 'Escalate — all bicycle versus vehicle accidents go to a supervisor before intake is completed', is_correct: false },
    ],
  },
  {
    question_text:
      'A 27-year-old woman was cycling home in a bike lane when a vehicle ran a stop sign at an intersection and struck her front wheel, launching her over the handlebars. The car drove off immediately and she does not have a plate number or description beyond "a dark sedan." However, she owns a car and her auto insurance policy — which she has confirmed includes UM coverage — covers her as a bicyclist under that same policy. She was treated at urgent care for a concussion and fractured elbow. What is the disposition?',
    options: [
      { option_text: 'Qualified — her UM policy extends coverage to her as a cyclist struck by a hit-and-run; no identified defendant is required', is_correct: true },
      { option_text: 'Not Qualified — UM coverage only applies when the policyholder is physically inside their own insured vehicle at the time of the accident', is_correct: false },
      { option_text: 'Conditional — must review the specific UM policy language to confirm it explicitly covers non-vehicle scenarios before accepting', is_correct: false },
      { option_text: 'Not Qualified — bicyclists need to carry separate bicycle insurance for hit-and-run claims to be valid', is_correct: false },
    ],
  },
  // ── HIT-AND-RUN / UM ────────────────────────────────────────────────────
  {
    question_text:
      'A caller was driving on I-215 when an unidentified dark-colored sedan sideswiped her vehicle and immediately fled the scene. She pulled over safely and called police, who responded and filed a hit-and-run report. We confirm she carries full coverage auto insurance that includes UM/UIM. She was treated for neck pain at an urgent care clinic the following morning. She was in her own vehicle at the time. What is the disposition?',
    options: [
      { option_text: 'Qualified — the caller has UM coverage; a documented hit-and-run with UM is a valid claim even without identifying the defendant', is_correct: true },
      { option_text: 'Not Qualified — hit-and-run cases require identifying the other driver and their insurer before any claim can be processed', is_correct: false },
      { option_text: 'Conditional — must file a formal police report before intake can be finalized; check on report status first', is_correct: false },
      { option_text: 'Escalate — all hit-and-run accidents need supervisor review and approval before intake', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was hit by a driver who fled the scene immediately on a surface street. Police were called but the driver was never located. When we pull up his insurance, he carries only liability-only coverage — no UM, no MedPay, nothing beyond the state minimum. He cannot identify the hit-and-run driver in any way. He was treated at urgent care with soft tissue injuries to his lower back. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — no UM coverage and no identified defendant means there is no path to recover damages', is_correct: true },
      { option_text: 'Qualified — liability-only carriers are still required to respond to hit-and-run claims under state law', is_correct: false },
      { option_text: 'Conditional — check if any household vehicle has a policy with UM coverage that he might be covered under', is_correct: false },
      { option_text: 'Escalate — all uninsured motorist situations where recovery is unclear must go to a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was rear-ended at a stop sign and the other driver immediately fled the scene. She says she believes she has "full coverage" but is not certain whether UM is included — she says she would need to look at her declarations page or call her insurer to confirm. She was treated at the ER the same night for neck pain and a possible concussion. There is no identified defendant. What is the disposition?',
    options: [
      { option_text: 'Conditional — the caller must verify UM coverage before intake can be finalized; flag the case as conditional pending UM confirmation', is_correct: true },
      { option_text: 'Not Qualified — uncertainty about UM coverage means we cannot accept the case under any circumstances', is_correct: false },
      { option_text: 'Qualified — full coverage always includes UM by default so we can proceed without verification', is_correct: false },
      { option_text: 'Escalate — unknown insurance status in a hit-and-run always requires supervisor review before disposition', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was rear-ended at a red light. The at-fault driver appeared insured at the scene and his insurance card is documented on the police report. However, when our office contacted the insurer, they confirmed the policy had lapsed nine days before the accident due to non-payment. The caller carries her own full coverage auto policy which she confirmed includes UM and UIM. She has been treating for lower back and neck pain and has missed two weeks of work. What is the disposition?',
    options: [
      { option_text: 'Qualified — the defendant\'s lapsed policy makes him effectively uninsured; the caller\'s UM coverage applies and the claim is fully viable', is_correct: true },
      { option_text: 'Not Qualified — if a valid insurance card was presented at the scene, the insurer must honor the claim regardless of any lapse', is_correct: false },
      { option_text: 'Conditional — must wait for the insurer\'s formal written coverage denial letter before the case can move forward', is_correct: false },
      { option_text: 'Escalate — lapsed policy situations require supervisor verification and coverage analysis before intake', is_correct: false },
    ],
  },
  // ── UNINSURED DRIVER ─────────────────────────────────────────────────────
  {
    question_text:
      'A caller was driving in California when another driver crossed the center line and struck him head-on. The at-fault driver is clearly identified, insured, and the police report places full fault on the other driver. However, during intake the caller reveals he was driving without auto insurance at the time of the accident — he had no policy in effect on the date of the crash. He is calling from California. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — California Proposition 213 bars uninsured drivers from recovering non-economic damages, making the personal injury claim nonviable', is_correct: true },
      { option_text: 'Qualified — the other driver was entirely at fault so the caller\'s own insurance status is legally irrelevant', is_correct: false },
      { option_text: 'Conditional — accept if the caller can document that the injuries were severe enough to trigger a Prop 213 exception', is_correct: false },
      { option_text: 'Escalate — uninsured driver cases always require attorney review before a final determination regardless of jurisdiction', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller in Nevada was stopped at a red light when she was rear-ended by an insured driver whose fault is not in dispute. The police report cites only the defendant, who has active insurance. During intake, however, the caller confirms she does not carry auto insurance and was uninsured on the date of the accident. She has neck and back injuries and has been treating at a chiropractor for 10 days. Nevada does not have a statute equivalent to California\'s Proposition 213. What is the disposition?',
    options: [
      { option_text: 'Qualified — Nevada does not bar uninsured drivers from recovery; with clear liability and documented injuries the case is accepted', is_correct: true },
      { option_text: 'Not Qualified — uninsured drivers are universally barred from recovering personal injury damages in all 50 states', is_correct: false },
      { option_text: 'Conditional — the caller must obtain a valid auto insurance policy before the case can formally proceed', is_correct: false },
      { option_text: 'Escalate — out-of-state cases involving an uninsured driver always require supervisor review and approval', is_correct: false },
    ],
  },
  // ── TREATMENT TIMING ─────────────────────────────────────────────────────
  {
    question_text:
      'A caller was in a rear-end accident 11 days ago. She went to the ER the same night and was diagnosed with cervical and lumbar strain. She was referred to physical therapy and has been attending sessions three times a week ever since. She still has significant pain in her neck and upper back and her physical therapist says she has several more weeks of treatment ahead. The defendant was cited and liability is not in dispute. What is the disposition?',
    options: [
      { option_text: 'Qualified — same-day ER treatment, consistent physical therapy three times weekly, and an active treatment plan all within normal parameters', is_correct: true },
      { option_text: 'Not Qualified — she waited too long; treatment must begin within 72 hours of the accident to qualify', is_correct: false },
      { option_text: 'Conditional — must confirm the physical therapy records specifically reference accident-related injuries before accepting', is_correct: false },
      { option_text: 'Escalate — any rear-end case still in active treatment at the 11-day mark must be reviewed by a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller says she was rear-ended three weeks ago and has significant shoulder and neck pain. When asked about medical treatment, she says she has not seen any doctor and has no medical records whatsoever. She says she doesn\'t like going to the doctor and hoped the pain would go away on its own. She is calling now because the pain has gotten worse, not better. She wants to know if she can file a personal injury claim. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — three weeks post-accident with zero medical treatment or documentation means there is no medical record to support a personal injury claim', is_correct: true },
      { option_text: 'Qualified — a caller\'s subjective report of pain is sufficient to establish the foundation for a personal injury claim', is_correct: false },
      { option_text: 'Conditional — accept if she agrees to see a doctor within the next 48 hours and begins treatment immediately', is_correct: false },
      { option_text: 'Escalate — treatment refusal cases must go to a supervisor before any determination is made', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was in an accident 35 days ago. She says she had severe pain immediately afterward but kept waiting, hoping it would improve on its own. She finally went to an urgent care clinic for the first time yesterday — day 35 — and this is her first-ever medical contact related to the accident. The liability is clear and the defendant is insured. She has no documented medical reason — no hospitalization, no financial barrier, no documented reason — for the 35-day delay. What is the disposition?',
    options: [
      { option_text: 'Escalate — 35 days to first medical contact is beyond the standard window; requires attorney evaluation for a possible serious-injury or documented-reason exception before accepting or rejecting', is_correct: true },
      { option_text: 'Not Qualified — any gap beyond 14 days from the accident date to first treatment is an automatic and non-negotiable disqualifier', is_correct: false },
      { option_text: 'Qualified — she eventually sought treatment and that is sufficient to establish a treatment record and proceed', is_correct: false },
      { option_text: 'Conditional — accept if she provides a written and signed affidavit explaining the reason for the delay in treatment', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was involved in an accident seven months ago. He went to the emergency room on the day of the accident with neck and back pain. He then did absolutely nothing medically for the next four and a half months. He is now attempting to resume chiropractic treatment. When asked about the gap, he says he "just got busy" with work and family and had no documented medical reason for stopping care entirely. He now wants to file a personal injury claim. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — a four-and-a-half-month unexplained gap in treatment destroys the continuity of care required to support a personal injury claim', is_correct: true },
      { option_text: 'Qualified — the ER visit on the day of the accident is sufficient to establish a valid and complete treatment record', is_correct: false },
      { option_text: 'Conditional — accept if he resumes consistent treatment immediately and commits to a documented ongoing plan going forward', is_correct: false },
      { option_text: 'Escalate — any case with a lengthy mid-treatment gap must go to a supervisor for evaluation before disposition', is_correct: false },
    ],
  },
  // ── SLIP AND FALL ─────────────────────────────────────────────────────────
  {
    question_text:
      'A 62-year-old woman slipped and fell on a wet tile floor inside a supermarket. There were no wet floor warning cones or signs of any kind posted near the spill. She fell directly onto her hip and could not get up. Emergency services transported her to the ER where imaging revealed a fractured hip requiring surgical repair. The store manager completed an incident report on site. The caller has the incident report number and says there are security cameras pointed directly at the area where she fell. What is the disposition?',
    options: [
      { option_text: 'Qualified — wet floor with no warning signs, an ER visit with a surgical fracture, a documented incident report, and camera evidence establish clear premises liability', is_correct: true },
      { option_text: 'Not Qualified — retail stores cannot be held liable for wet floors that result naturally from customer foot traffic', is_correct: false },
      { option_text: 'Conditional — must independently verify that no warning signs were present anywhere in the area before accepting', is_correct: false },
      { option_text: 'Escalate — all slip-and-fall cases must be reviewed by a supervisor before intake is completed', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller says he fell in a grocery store parking lot. When asked what caused the fall, he says he isn\'t sure — he just "went down." He describes the pavement as dry and completely level with no cracks, no raised edges, no potholes, and no visible debris. He believes he may have simply lost his balance or tripped over his own feet. He has a sprained wrist and bruised knee from trying to catch himself. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — no identifiable property hazard means no negligence by the property owner; an unexplained fall on level, dry ground is not a viable premises liability claim', is_correct: true },
      { option_text: 'Qualified — property owners are responsible for any injury that occurs on their premises regardless of whether a specific hazard caused it', is_correct: false },
      { option_text: 'Conditional — accept if he can locate a witness who actually observed what caused him to fall', is_correct: false },
      { option_text: 'Escalate — all falls on commercial property require attorney investigation for possible hidden hazards before rejection', is_correct: false },
    ],
  },
  // ── DOG BITE ──────────────────────────────────────────────────────────────
  {
    question_text:
      'A 19-year-old man was visiting his neighbor\'s home when the neighbor\'s German Shepherd lunged unprovoked and bit him deeply on the forearm and thigh. He was transported to the ER where the wounds required 14 stitches and he began a rabies prophylaxis series. He did nothing to provoke the dog — he was simply standing in the entryway. The neighbor carries an active homeowners insurance policy that covers dog bites up to $300,000. What is the disposition?',
    options: [
      { option_text: 'Qualified — unprovoked dog bite requiring ER stitches with an identified owner and active homeowners coverage is a standard dog bite claim', is_correct: true },
      { option_text: 'Not Qualified — the caller was voluntarily on the dog owner\'s property and assumed the inherent risk of being around animals', is_correct: false },
      { option_text: 'Conditional — must confirm in detail that the caller did not provoke or agitate the dog before accepting', is_correct: false },
      { option_text: 'Escalate — all dog bite incidents go to a supervisor before any intake decision is made', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was walking on a public sidewalk when a stray dog with no collar ran out from an alley and nipped at his ankle. The bite barely broke the skin and did not require stitches or any medical treatment — he cleaned the wound at home with antiseptic. The dog ran off immediately. No owner or identifying information was obtained and animal control has no record matching the animal. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — no identifiable owner and a minor injury requiring no medical treatment means there is no viable claim to pursue', is_correct: true },
      { option_text: 'Qualified — the city or county is responsible for all stray animal incidents that occur on public property', is_correct: false },
      { option_text: 'Qualified — the caller can file a claim through local animal control\'s municipal liability insurance program', is_correct: false },
      { option_text: 'Escalate — all animal attack incidents must go to a supervisor before any disposition is given', is_correct: false },
    ],
  },
  // ── MINORS ────────────────────────────────────────────────────────────────
  {
    question_text:
      'A caller in Nevada was rear-ended at a stoplight. Her 9-year-old daughter was in the back seat in a car seat and appears to have no injuries — no visible bruising, no complaints of pain, and normal range of motion when checked by paramedics at the scene. The mother sustained soft tissue injuries to her neck and back and has been treating at a chiropractor for a week. She wants to include her daughter in the claim since she was a passenger. Nevada allows an injured adult to sign for an uninjured minor in the same accident. What is the disposition?',
    options: [
      { option_text: 'Qualified — Nevada allows an injured adult to sign for an uninjured minor passenger in the same accident; include the daughter', is_correct: true },
      { option_text: 'Not Qualified — uninjured minors cannot be included in any personal injury claim under any circumstances in any state', is_correct: false },
      { option_text: 'Escalate — any case involving a minor automatically requires escalation to a supervisor regardless of injury status', is_correct: false },
      { option_text: 'Conditional — wait 30 days to confirm the daughter develops no delayed injury symptoms before deciding whether to include her', is_correct: false },
    ],
  },
  {
    question_text:
      'A 10-year-old boy was a passenger in his uncle\'s car when the uncle was rear-ended at a red light. The uncle was not injured. The boy has neck pain and a possible concussion and was evaluated at an urgent care clinic. The boy\'s mother, who was not in the vehicle and was not injured, is calling to file a claim for her son\'s injuries. She is the boy\'s legal guardian. The incident occurred in California. What is the disposition?',
    options: [
      { option_text: 'Escalate — California does not allow a non-injured adult to sign for an injured minor; the case requires attorney handling to be filed properly through the courts', is_correct: true },
      { option_text: 'Qualified — a parent or legal guardian can sign for an injured minor in any state under any circumstances', is_correct: false },
      { option_text: 'Not Qualified — minors cannot file any personal injury claims and must wait until they turn 18 before doing so', is_correct: false },
      { option_text: 'Conditional — the non-injured mother may sign as guardian in most situations but must provide notarized proof of guardianship first', is_correct: false },
    ],
  },
  // ── MISC ──────────────────────────────────────────────────────────────────
  {
    question_text:
      'A caller was driving on a two-lane highway at night when a large buck deer ran across the road without warning and he struck it at full speed. The impact was severe — significant front-end damage to his SUV and the airbags deployed. He has chest soreness from the airbag and a minor cut on his hand from the steering wheel. He carries comprehensive coverage on his vehicle but confirms he does not carry UM. He is asking about filing a personal injury claim and wants to know "who is responsible." What is the disposition?',
    options: [
      { option_text: 'Not Qualified — a deer strike is a natural occurrence with no actionable defendant; this is a comprehensive auto insurance property claim, not a personal injury case against any party', is_correct: true },
      { option_text: 'Qualified — the state transportation department may be liable for inadequate wildlife crossing signage and fence maintenance along that highway', is_correct: false },
      { option_text: 'Conditional — accept only if it can be shown that a government-posted wildlife warning sign was absent or missing at the location of the strike', is_correct: false },
      { option_text: 'Escalate — single-vehicle animal collision incidents require supervisor determination before any disposition is given', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was involved in an auto accident nine months ago. Shortly after, the defendant\'s insurer sent her a property damage settlement check which she endorsed and cashed to pay for vehicle repairs. She never signed any general release of claims, any liability waiver, or any all-inclusive settlement agreement — only the check itself. She now has an open bodily injury claim that was never discussed as part of the property damage process and has never been settled. She has ongoing medical treatment and wants to pursue her injury claim now. What is the disposition?',
    options: [
      { option_text: 'Qualified — cashing a property damage check does not release a bodily injury claim as long as no full general release was signed; the injury claim remains completely viable', is_correct: true },
      { option_text: 'Not Qualified — cashing any settlement check from the defendant\'s insurer permanently releases all claims arising from that accident', is_correct: false },
      { option_text: 'Conditional — must have an attorney review the specific check endorsement and any correspondence before the case can move forward', is_correct: false },
      { option_text: 'Escalate — any caller who has already received and cashed money from the defendant\'s insurer must always be escalated to a supervisor', is_correct: false },
    ],
  },
]

export async function POST(request: NextRequest) {
  // Auth check via server client
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const force = url.searchParams.get('force') === 'true'

  // Check if exam already exists
  const { data: existing } = await admin
    .from('modules')
    .select('id')
    .eq('title', 'Nuance Book Exam')
    .maybeSingle()

  if (existing) {
    if (!force) {
      return NextResponse.json({ error: 'Exam already exists', moduleId: existing.id }, { status: 409 })
    }
    // Force mode: delete existing module (cascade deletes questions + options)
    await admin.from('modules').delete().eq('id', existing.id)
  }

  // Insert module
  const { data: newModule, error: moduleError } = await admin
    .from('modules')
    .insert({
      title: 'Nuance Book Exam',
      description:
        'Comprehensive 50-question assessment covering all nuance book scenarios — auto-accident liability, premises, treatment timing, and procedural rules.',
      pass_threshold: 80,
      is_required: false,
      is_active: true,
    })
    .select()
    .single()

  if (moduleError || !newModule) {
    console.error('Module insert error:', moduleError)
    return NextResponse.json({ error: moduleError?.message ?? 'Failed to create module' }, { status: 500 })
  }

  const moduleId: string = newModule.id

  // Insert questions and options
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i]
    const position = i + 1

    const { data: newQuestion, error: questionError } = await admin
      .from('questions')
      .insert({
        module_id: moduleId,
        question_text: q.question_text,
        position,
      })
      .select()
      .single()

    if (questionError || !newQuestion) {
      console.error(`Question ${position} insert error:`, questionError)
      continue
    }

    const optionsToInsert = q.options.map((opt, oi) => ({
      question_id: newQuestion.id,
      option_text: opt.option_text,
      is_correct: opt.is_correct,
      position: oi + 1,
    }))

    const { error: optionsError } = await admin.from('options').insert(optionsToInsert)

    if (optionsError) {
      console.error(`Options for question ${position} insert error:`, optionsError)
    }
  }

  return NextResponse.json({ success: true, moduleId })
}
