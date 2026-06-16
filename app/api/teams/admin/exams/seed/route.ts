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
      'The caller is Maria Lopez, calling about her own accident — right person. The accident happened 9 days ago on a Thursday evening. Maria was stopped at a red light on a busy four-lane road when she felt a hard impact from behind. The other driver, in a Nissan Altima, admitted fault at the scene — "I was looking at my phone." A police officer responded, cited the other driver for distracted driving, and took both statements. Maria has the defendant\'s insurance card — State Farm, confirmed active. She felt immediate neck and back pain, went to the ER that same evening (diagnosed with cervical and lumbar strain), and has been attending a chiropractic clinic three times per week for the past week and a half. Her rear bumper is pushed in and her trunk will not close. Maria\'s own auto policy was active on the date of loss. What is the disposition?',
    options: [
      { option_text: 'Qualified — clean rear-end with cited defendant, active State Farm policy, same-day ER, consistent chiropractic, and her own policy was active on the date of loss', is_correct: true },
      { option_text: 'Not Qualified — she must wait 30 days after the accident before she is eligible to file a claim', is_correct: false },
      { option_text: 'Conditional — must first confirm the defendant\'s State Farm policy has not lapsed since the accident date', is_correct: false },
      { option_text: 'Escalate — any rear-end accident involving an ER visit must go to a supervisor before intake is completed', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is David Kim, calling about his own accident — right person. The accident happened three days ago around noon. David was stopped at a red light when the car behind him bumped his vehicle. Neither vehicle has any visible damage — not a scratch. But the next morning he woke up with significant neck stiffness and pain between his shoulder blades. He went to his primary care doctor two days later, who documented cervical muscle spasm and referred him to physical therapy. His first PT session is tomorrow. A police report was filed and the defendant is insured with Allstate. David\'s own auto policy was active on the date of loss. What is the disposition?',
    options: [
      { option_text: 'Conditional — zero visible damage on both vehicles raises a soft liability issue that requires supervisory review before accepting', is_correct: true },
      { option_text: 'Qualified — his documented injury alone qualifies him regardless of whether there is any property damage', is_correct: false },
      { option_text: 'Not Qualified — no visible damage to either vehicle means there is no valid personal injury claim', is_correct: false },
      { option_text: 'Escalate — zero-damage soft tissue cases must go directly to a senior attorney before any disposition', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Alicia Torres, calling about her own accident — right person. She says she was "rear-ended" while stopped at a light and wants to file a claim. As intake proceeds, she discloses that all of the damage on her car is on the front bumper — not the rear. When asked how the front bumper got damaged in a rear-end collision, she cannot give a clear answer. She says the other driver "came from behind somehow" but becomes evasive when pressed about the direction of impact. No police report was filed. The other driver disputes the rear-end claim entirely. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — front-end damage directly contradicts a rear-end claim; the account is inconsistent and not credible', is_correct: true },
      { option_text: 'Qualified — we take the caller\'s version of events at face value during intake', is_correct: false },
      { option_text: 'Conditional — accept the case but flag the damage location discrepancy for the attorney to investigate', is_correct: false },
      { option_text: 'Escalate — any account involving contradictory damage information must go to a supervisor before any determination', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Jasmine Reed, calling about her own accident — right person. The accident happened six days ago around 5 PM in heavy freeway traffic. Jasmine was the second of three cars stopped at a red light. A pickup truck traveling at high speed rear-ended the car directly behind her, pushing that car into Jasmine\'s vehicle, which was then pushed into the car ahead. Jasmine says she did nothing to contribute to the accident — the chain reaction started from behind her. She has photos of rear damage to her car and was transported by ambulance to the hospital with neck pain and a concussion. The police report identifies the pickup truck driver as the at-fault party. The defendant is insured with GEICO. Jasmine\'s own policy was active on the date of loss. What is the disposition?',
    options: [
      { option_text: 'Qualified — she was pushed by the at-fault rear driver and bears no fault for the chain reaction', is_correct: true },
      { option_text: 'Not Qualified — she struck the car in front of her and is a contributing party to the accident', is_correct: false },
      { option_text: 'Conditional — chain-reaction accidents always involve shared fault and must be reviewed by a supervisor', is_correct: false },
      { option_text: 'Escalate — three-vehicle accidents require supervisor approval before any intake can be completed', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Marcus Webb, calling about his own accident — right person. The accident happened two days ago on the interstate. During intake, Marcus admits he had been intentionally brake-checking the driver behind him for several miles because that driver was aggressively tailgating him. The tailgating driver eventually rear-ended him when he brake-checked one more time. He claims he has dashcam footage capturing the entire interaction, including the extended tailgating. Both vehicles have damage and Marcus reports lower back pain. He has been to urgent care and was prescribed muscle relaxers. What is the disposition?',
    options: [
      { option_text: 'Escalate — intentional brake-checking combined with documented provocation requires attorney evaluation before any intake determination is made', is_correct: true },
      { option_text: 'Not Qualified — intentional brake-checking makes him the at-fault party regardless of what preceded the collision', is_correct: false },
      { option_text: 'Qualified — the defendant still rear-ended him and therefore bears full liability for the collision', is_correct: false },
      { option_text: 'Conditional — accept only if the dashcam footage clearly establishes that the tailgating began first', is_correct: false },
    ],
  },
  // ── LEFT TURN ─────────────────────────────────────────────────────────────
  {
    question_text:
      'The caller is Robert Chen, calling about his own accident — right person. The accident happened four days ago around 6:30 PM at a busy intersection. Robert was driving straight through the intersection on a solid green light when the car in the opposing lane cut across traffic to make an unprotected left turn directly in front of him. He had no time to react. The impact deployed his front airbag and totaled his vehicle. He was transported by ambulance to the hospital with chest bruising from the airbag and left shoulder pain. The police report documents that the defendant made an improper left turn and confirms Robert had the right of way. The defendant is insured with Progressive. Robert\'s own auto policy was active on the date of loss. What is the disposition?',
    options: [
      { option_text: 'Qualified — defendant made an unprotected left turn in front of a driver traveling straight with the green; liability is documented in the police report', is_correct: true },
      { option_text: 'Not Qualified — intersection accidents are always treated as shared-fault incidents between both drivers', is_correct: false },
      { option_text: 'Conditional — must first confirm Robert was not exceeding the speed limit at the time of impact', is_correct: false },
      { option_text: 'Escalate — any accident with airbag deployment and a totaled vehicle requires supervisor approval before intake', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Sandra Morales, calling about her own accident — right person. The accident happened five days ago at an intersection. Sandra was making an unprotected left turn when a vehicle traveling straight struck her driver\'s side door. She admits she was the one turning left. She says the light was yellow when she started her turn and insists she had enough time to clear the intersection. There are no witnesses and no traffic cameras. The other driver, who was not cited, says the light was green in his favor and he had no time to brake. Sandra has soft tissue injuries and is currently treating at a chiropractor. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the caller made an unprotected left turn and is the at-fault party; no evidence supports her account over the straight-traveling driver', is_correct: true },
      { option_text: 'Qualified — a yellow light gives a turning driver the right to proceed and complete the turn without restriction', is_correct: false },
      { option_text: 'Conditional — accept if she can locate a witness or find nearby surveillance footage to corroborate her account of the signal', is_correct: false },
      { option_text: 'Escalate — disputed fault in left-turn intersection accidents must go to a supervisor before any disposition is given', is_correct: false },
    ],
  },
  {
    question_text:
      'A family is calling on behalf of a woman who was killed in a car accident — wrong person calling for the deceased. She was a passenger in a vehicle driven by her boyfriend. The boyfriend made an unprotected left turn at a busy intersection and was struck by oncoming traffic traveling straight. Both the boyfriend and the passenger were killed. Liability rests entirely with the boyfriend who made the left turn. The deceased passenger\'s family is asking whether they can bring a wrongful death claim on her behalf. What is the disposition?',
    options: [
      { option_text: 'Escalate — wrongful death of a passenger in an at-fault vehicle involves complex exception rules and requires attorney evaluation before any determination can be made', is_correct: true },
      { option_text: 'Not Qualified — when the driver is at fault, his passengers can never bring any recovery claim under any circumstances', is_correct: false },
      { option_text: 'Qualified — passengers always retain independent recovery rights separate from the fault of the driver they were riding with', is_correct: false },
      { option_text: 'Conditional — proceed only if the family can prove the passenger had no knowledge the driver would make an unsafe turn', is_correct: false },
    ],
  },
  // ── MERGE / SIDESWIPE ────────────────────────────────────────────────────
  {
    question_text:
      'The caller is Nicole Hurst, calling about her own accident — right person. The accident happened eight days ago around 7 AM on the freeway during the morning commute. Nicole had been traveling in the center lane for at least two miles when a vehicle in the left lane slowly drifted sideways without signaling and scraped along the entire driver\'s side of her car from front to rear. She held her lane position and never moved left. A police report was taken at the scene and the officer cited the other driver for failure to maintain lane. She has been treating for left shoulder pain and neck stiffness at a physical therapy clinic. The defendant is insured with Farmers. Nicole\'s own policy was active on the date of loss. What is the disposition?',
    options: [
      { option_text: 'Qualified — caller was in an established lane, held her position, and the defendant was cited for drifting into her', is_correct: true },
      { option_text: 'Not Qualified — sideswipe accidents on the freeway are always treated as shared-fault incidents between both drivers', is_correct: false },
      { option_text: 'Conditional — must verify she had been traveling in the center lane for a sufficient distance before the sideswipe occurred', is_correct: false },
      { option_text: 'Escalate — all freeway sideswipe accidents must go to a supervisor before intake is completed', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Kevin Jackson, calling about his own accident — right person. The accident happened this morning on the freeway. Kevin was merging onto the interstate from an on-ramp when a vehicle already in the travel lane struck his passenger side as he attempted to enter. He admits he was the one entering the freeway from the ramp and says he "thought he had enough room." There is minor damage to both vehicles and he reports neck soreness. The defendant disputes the account and says Kevin merged without checking his mirrors. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the caller was the merging vehicle; vehicles entering from an on-ramp must yield to established freeway traffic', is_correct: true },
      { option_text: 'Qualified — the travel-lane driver had a legal duty to allow adequate room for merging vehicles', is_correct: false },
      { option_text: 'Conditional — accept only if a witness or camera can confirm the freeway driver was exceeding the speed limit at the time of the merge', is_correct: false },
      { option_text: 'Escalate — all highway merge accidents must go to a supervisor before any disposition is given', is_correct: false },
    ],
  },
  // ── TRAFFIC LIGHT DISPUTES ───────────────────────────────────────────────
  {
    question_text:
      'The caller is Patricia Williams, calling about her own accident — right person. The accident happened three days ago at a major intersection. Patricia says she had a solid green light when a vehicle blew through the red from the cross-street and T-boned her on the driver\'s side. She was transported by ambulance to the hospital with rib fractures and a broken wrist. The police report includes a statement from an independent pedestrian witness — standing at the crosswalk, not affiliated with either driver — who confirms Patricia had the green light. The defendant is insured with Liberty Mutual. Patricia\'s own policy was active on the date of loss. What is the disposition?',
    options: [
      { option_text: 'Qualified — an independent pedestrian witness on the police report resolves the light dispute in the caller\'s favor; serious injuries and clear liability', is_correct: true },
      { option_text: 'Not Qualified — traffic light disputes can never be accepted without video camera footage of the signal', is_correct: false },
      { option_text: 'Conditional — must obtain a photo of the traffic signal or an intersection diagram before proceeding', is_correct: false },
      { option_text: 'Escalate — T-bone accidents resulting in fractures must go to a supervisor before intake is completed', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Anthony Davis, calling about his own accident — right person. He says he had the green light when the other driver ran the red and struck him at an intersection. The other driver is telling his insurer the same thing — that he had the green. There are no cameras at this intersection. Both drivers agreed to exchange information privately and no police were called. Anthony\'s dashcam was pointed forward but not toward the traffic signal. No witnesses stopped at the scene. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — an unresolvable he-said/she-said light dispute with no witnesses, no cameras, and no police report means liability cannot be established', is_correct: true },
      { option_text: 'Qualified — we accept the caller\'s stated account of the signal during intake', is_correct: false },
      { option_text: 'Conditional — have the caller check nearby businesses for any security camera footage before making a final determination', is_correct: false },
      { option_text: 'Escalate — tied liability situations always require a supervisor to review and break the deadlock', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Luis Ramirez, calling about his own accident — right person. The accident happened seven days ago around 3 PM. Luis was driving on a main boulevard when a vehicle coming from a residential side street that had a clearly posted stop sign ran that stop sign and pulled directly into his path. He had the right of way and had no time to brake before impact. The police report identifies the side street driver as at fault for failing to obey the stop sign and failing to yield. Luis was treated at urgent care the same day for lower back strain and a laceration to his forearm. The defendant is insured with Nationwide. Luis\'s own policy was active on the date of loss. What is the disposition?',
    options: [
      { option_text: 'Qualified — defendant failed to obey a stop sign and entered a boulevard driver\'s right of way; liability is documented in the police report', is_correct: true },
      { option_text: 'Not Qualified — boulevard versus side street collisions are inherently shared-liability situations', is_correct: false },
      { option_text: 'Conditional — must independently confirm the stop sign was fully visible and unobstructed at the time of the accident', is_correct: false },
      { option_text: 'Escalate — right-of-way disputes at intersections must go to a supervisor before any disposition is given', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Brenda Scott, calling about her own accident — right person. During intake she reveals she was pulling out of a private driveway onto a main road when a car traveling on the road struck her passenger side. She admits she didn\'t see the car coming before she pulled forward into traffic. She has soft tissue neck and shoulder injuries and her car has significant passenger-side damage. The responding officer found her at fault and issued her a citation for failure to yield. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the caller pulled out of a driveway and failed to yield to oncoming traffic; she is the at-fault party per the police officer\'s determination', is_correct: true },
      { option_text: 'Qualified — driveways and main roads share an equal right of way under state traffic law', is_correct: false },
      { option_text: 'Conditional — can proceed if the oncoming driver can be shown to have been exceeding the posted speed limit', is_correct: false },
      { option_text: 'Escalate — single-fault driveway accidents always require a supervisor before any disposition is given', is_correct: false },
    ],
  },
  // ── GOVERNMENT VEHICLES ──────────────────────────────────────────────────
  {
    question_text:
      'The caller is Tamara Brooks, calling about her own accident — right person. She was driving through an intersection when a city police cruiser with its lights and siren fully activated entered the same intersection against the red and struck her vehicle on the driver\'s side. She has soft tissue injuries and her car is totaled. When we pull up her insurance, she carries only liability-only coverage — no UM, no MedPay, nothing beyond the state minimum. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — government emergency vehicles operating with active lights and sirens have statutory right of way; without UM coverage there is no viable path to recovery', is_correct: true },
      { option_text: 'Qualified — the police cruiser still struck her and the city bears responsibility for any resulting injuries', is_correct: false },
      { option_text: 'Conditional — accept if the officer\'s use of the intersection was later found unreasonable by an internal departmental review', is_correct: false },
      { option_text: 'Escalate — all accidents involving law enforcement vehicles must go to a supervisor before any determination is made', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Jerome Allen, calling about his own accident — right person. He was stopped at a green light when a police cruiser running full lights and sirens entered the intersection and struck another car that was crossing on red. That struck vehicle was pushed sideways directly into Jerome\'s car, spinning him into the curb. Jerome had a legal green light and no connection to the first impact. He was treated at the hospital for whiplash and a fractured wrist. What is the disposition?',
    options: [
      { option_text: 'Qualified — Jerome was an uninvolved third party struck in a secondary collision; the government vehicle\'s right-of-way exception does not extend to a downstream impact on an unrelated bystander', is_correct: true },
      { option_text: 'Not Qualified — any accident that originates from a police vehicle running lights and sirens disqualifies all downstream claims from every vehicle involved', is_correct: false },
      { option_text: 'Conditional — only qualifies if Jerome also carries UM coverage on his own auto policy', is_correct: false },
      { option_text: 'Escalate — any accident that involves a law enforcement vehicle in any way must be escalated to a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Dennis Cooper, calling about his own accident — right person. He was rear-ended by a city water department truck approximately five and a half months ago in California. He has a police report, his own medical records documenting injuries, and a witness who saw the collision. He is calling us for the first time today. California Government Code requires that a claim against a government entity be filed within six months of the incident. What is the disposition?',
    options: [
      { option_text: 'Escalate — at five and a half months against a California government entity, the six-month filing deadline is weeks away; this needs immediate urgent attorney review', is_correct: true },
      { option_text: 'Qualified — five months is well within the standard two-year personal injury statute of limitations', is_correct: false },
      { option_text: 'Not Qualified — city-owned vehicle accidents cannot be pursued as personal injury cases', is_correct: false },
      { option_text: 'Conditional — accept if Dennis has previously submitted any written complaint or notice to the city department', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Tiffany Grant, calling about her own accident — right person. She was rear-ended while stopped at a traffic light by a driver in a clearly marked white USPS mail truck making deliveries on his regular route. She has neck and back pain and started treating at a chiropractor three days after the accident. A police report was taken at the scene identifying the USPS driver. She wants to know how to file a claim and whether we can take her case. What is the disposition?',
    options: [
      { option_text: 'Escalate — USPS is a federal government entity subject to special claim procedures under the Federal Tort Claims Act; do not accept or reject unilaterally — needs attorney handling', is_correct: true },
      { option_text: 'Not Qualified — federal government vehicles carry complete immunity from all personal injury lawsuits under any circumstances', is_correct: false },
      { option_text: 'Qualified — treat this exactly like any other commercial delivery vehicle claim and proceed with standard intake', is_correct: false },
      { option_text: 'Conditional — accept only if the police report explicitly cites the USPS driver for causing the collision', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Evelyn Morris, calling about her own accident — right person. She was riding as a passenger on a public bus when a private vehicle ran a stop sign and struck the bus on the driver\'s side. The bus driver was not at fault. Evelyn was thrown from her seat and hit her shoulder on a metal grab rail. She was transported by ambulance and treated for a shoulder contusion and referred to orthopedics. The at-fault car driver is identified and carries active State Farm insurance. What is the disposition?',
    options: [
      { option_text: 'Qualified — a third-party vehicle caused the accident; the bus passenger has a direct claim against the at-fault driver', is_correct: true },
      { option_text: 'Not Qualified — bus passengers can only recover through the transit authority\'s insurance, not through the at-fault private vehicle\'s carrier', is_correct: false },
      { option_text: 'Conditional — must verify the transit authority will cooperate with the discovery and litigation process', is_correct: false },
      { option_text: 'Escalate — all transit-related accidents require supervisor review before any disposition is given', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is George Fletcher, calling about his own accident — right person. He was riding as a passenger on a city bus when the driver braked hard to avoid a car that pulled directly in front of the bus. No collision occurred — the bus stopped in time. But George was standing in the aisle and was thrown forward, hitting a metal pole and injuring his wrist. He wants to know if the car that cut off the bus is responsible for his injury. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — no collision occurred; an injury from an emergency bus stop with no impact between vehicles is not a valid auto accident personal injury claim', is_correct: true },
      { option_text: 'Qualified — the car that cut off the bus acted negligently and is the indirect cause of his injury', is_correct: false },
      { option_text: 'Conditional — accept if the bus company confirms the stop was unreasonably abrupt given the road and traffic conditions', is_correct: false },
      { option_text: 'Escalate — bus incidents involving passenger falls without a collision require supervisor review before any determination', is_correct: false },
    ],
  },
  // ── HOUSEHOLD MEMBER EXCLUSION ───────────────────────────────────────────
  {
    question_text:
      'The caller is Rebecca Turner, calling about her own accident — right person. Her husband was driving when he ran a stop sign and caused a collision. She was in the passenger seat and was injured. They have been married for six years, live at the same address, and share the same auto insurance policy. She wants to know if she can file a personal injury claim against her husband\'s liability coverage for the injuries she sustained in his accident. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the at-fault driver is her husband and they share the same household; the household member exclusion bars recovery under his liability policy', is_correct: true },
      { option_text: 'Qualified — spouses can sue each other for negligence under general tort principles in all states', is_correct: false },
      { option_text: 'Conditional — proceed if she files first under any MedPay coverage on their shared policy before pursuing liability', is_correct: false },
      { option_text: 'Escalate — accidents between spouses always require supervisor determination on the household exclusion before disposition', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Brian Washington, calling about his own accident — right person. He was a passenger in a car driven by his coworker and close friend. The friend ran a red light and caused the collision. Brian and the driver are not related, have never lived together, and share no finances. Brian was treated at urgent care the same day for soft tissue neck and back injuries. The friend carries active auto liability insurance. What is the disposition?',
    options: [
      { option_text: 'Qualified — the driver is not a household member; Brian as a passenger can recover from the at-fault driver\'s liability coverage', is_correct: true },
      { option_text: 'Not Qualified — passengers can never file personal injury claims against the driver of the vehicle they were riding in', is_correct: false },
      { option_text: 'Conditional — must verify the friend\'s policy is active and has adequate limits before accepting the case', is_correct: false },
      { option_text: 'Escalate — all passenger-versus-driver cases require attorney review before intake can be completed', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Carlos Vega, calling about his own accident — right person. His fiancée was driving when she caused an accident and Carlos was injured as a passenger. They are engaged but live at separate addresses in different cities — each with their own lease. They are not yet legally married. The fiancée carries active auto insurance. Carlos has soft tissue injuries and has started treating at a chiropractor. What is the disposition?',
    options: [
      { option_text: 'Qualified — they do not share a household; the household member exclusion does not apply regardless of their engagement status', is_correct: true },
      { option_text: 'Not Qualified — engaged couples are treated the same as legally married couples under the household member exclusion', is_correct: false },
      { option_text: 'Not Qualified — any romantic partner is automatically considered a household member for insurance exclusion purposes', is_correct: false },
      { option_text: 'Conditional — depends on how long they have been living at separate addresses before the exclusion can be ruled out', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Mary Johnson, calling about her own accident — right person. Her son, who is 26, was driving when he caused a rear-end collision and she was injured as a passenger. Her son moved back home after college. They live at the same address and he is listed on her auto insurance policy. She was treated at urgent care for cervical strain and wants to file a claim through her son\'s insurance. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the at-fault son shares the same household as the caller; the household exclusion applies regardless of the son\'s age', is_correct: true },
      { option_text: 'Qualified — adult children are legally independent individuals even when they currently reside with their parents', is_correct: false },
      { option_text: 'Conditional — depends on whether the son is listed as a primary or secondary driver on the household\'s shared policy', is_correct: false },
      { option_text: 'Escalate — parent-child accident claims always require supervisor review on the household exclusion question before disposition', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Carol Simmons, calling about her own accident — right person. She was a passenger in her daughter\'s car when her daughter rear-ended another vehicle. Carol has soft tissue neck and back injuries and has been treating at a chiropractor. The daughter lives independently in her own apartment in a different city with her own lease. The daughter carries her own separate auto insurance policy and has not lived with Carol in over two years. What is the disposition?',
    options: [
      { option_text: 'Qualified — the daughter does not reside with the caller; the household exclusion does not apply', is_correct: true },
      { option_text: 'Not Qualified — any parent-child relationship triggers the household exclusion regardless of where each party currently lives', is_correct: false },
      { option_text: 'Conditional — must confirm the daughter has been living independently for at least 12 consecutive months before ruling out the exclusion', is_correct: false },
      { option_text: 'Escalate — family member accidents always require supervisor determination on whether the household exclusion applies', is_correct: false },
    ],
  },
  // ── RIDESHARE ─────────────────────────────────────────────────────────────
  {
    question_text:
      'The caller is Lisa Park, calling about her own accident — right person. She was riding as a passenger in an Uber when a vehicle ran a red light and slammed into the passenger side of the Uber. The Uber driver had the green light and is not at fault. Lisa was transported by ambulance to the hospital with a broken collarbone and facial lacerations. The at-fault vehicle is identified and insured with Farmers Insurance. The Uber app confirms the trip was in active status at the time of the crash. What is the disposition?',
    options: [
      { option_text: 'Qualified — a third-party vehicle is at fault; Lisa has a direct claim against the at-fault driver', is_correct: true },
      { option_text: 'Not Qualified — Uber passengers can only recover through Uber\'s own commercial insurance program, not the at-fault driver directly', is_correct: false },
      { option_text: 'Conditional — must confirm the Uber trip was in active status before any intake determination can be made', is_correct: false },
      { option_text: 'Escalate — all rideshare-involved accidents require supervisor review before any disposition is given', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is James Ortega, calling about his own accident — right person. He was riding in an Uber late at night when the Uber driver, with no other vehicle involved, drifted off the freeway and struck a concrete median barrier. The driver had fallen asleep at the wheel. James has significant head lacerations, a broken nose, and is currently hospitalized. The Uber app confirms the trip was in active status at the time of the single-vehicle crash. What is the disposition?',
    options: [
      { option_text: 'Qualified — Uber maintains substantial commercial insurance covering passenger injuries in single-vehicle crashes when the trip is in active status', is_correct: true },
      { option_text: 'Not Qualified — there is no third-party defendant in a single-car accident, so there is no viable personal injury claim path', is_correct: false },
      { option_text: 'Conditional — the entire case depends on whether the Uber app can definitively confirm the trip was in active status at the moment of impact', is_correct: false },
      { option_text: 'Not Qualified — the caller would need to pursue the Uber driver personally, which is outside our intake scope', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Amanda Cross, calling about her own accident — right person. She was a passenger in an Uber when a car cut in front of the Uber on the freeway without warning. The Uber driver braked hard to avoid a collision and was successful — no contact occurred between the two vehicles. Amanda, who was not wearing a seatbelt, slid forward and struck the back of the front seat, injuring her knee. She wants to know if the car that cut them off is responsible for her injury. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — no collision occurred; a hard brake with no contact between vehicles does not constitute a valid auto accident personal injury claim', is_correct: true },
      { option_text: 'Qualified — the car that cut off the Uber was negligent and is the proximate cause of Amanda\'s knee injury', is_correct: false },
      { option_text: 'Conditional — accept if the Uber\'s dashcam captured the license plate of the vehicle that cut them off', is_correct: false },
      { option_text: 'Escalate — rideshare braking incidents without a collision require supervisor review before any disposition', is_correct: false },
    ],
  },
  // ── PEDESTRIANS ───────────────────────────────────────────────────────────
  {
    question_text:
      'The caller is Dorothy Barnes, calling about her own accident — right person. She was walking in a painted crosswalk with the pedestrian walk signal illuminated when a vehicle making a right turn on red struck her and threw her to the ground. She was transported by ambulance and admitted overnight to the hospital with a fractured hip and head lacerations. The driver stopped at the scene, is identified, and carries active insurance with USAA. What is the disposition?',
    options: [
      { option_text: 'Qualified — pedestrian had the walk signal in a marked crosswalk; the driver failed to yield on a right turn; liability and serious injuries are both clear', is_correct: true },
      { option_text: 'Not Qualified — pedestrians in the roadway are always considered partially at fault for failing to watch for turning vehicles', is_correct: false },
      { option_text: 'Conditional — must confirm the crosswalk was properly painted and maintained before the case can be accepted', is_correct: false },
      { option_text: 'Escalate — all pedestrian accidents resulting in fractures require supervisor escalation before any intake is completed', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Frank Carter, calling about his own accident — right person. He was walking on a sidewalk when a car veered off the road and struck him before speeding away. The driver fled and despite a police investigation has not been identified. Frank does not own a vehicle, has no auto insurance policy of any kind, and does not live with anyone who carries auto insurance. He was treated at the ER for a fractured leg. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the driver is unidentified and the caller has no UM coverage of any kind; there is no viable path to recover damages', is_correct: true },
      { option_text: 'Qualified — pedestrian hit-and-run victims can always pursue a claim regardless of UM coverage status', is_correct: false },
      { option_text: 'Conditional — check whether any household member has an auto policy with UM coverage that might extend to him', is_correct: false },
      { option_text: 'Escalate — all pedestrian hit-and-run accidents require supervisor review before any determination is made', is_correct: false },
    ],
  },
  // ── BICYCLES ──────────────────────────────────────────────────────────────
  {
    question_text:
      'The caller is Michael Torres, calling about his own accident — right person. He was riding in a bike lane when an occupant of a parked car swung the driver\'s door open directly into his path without looking. He was thrown over the door, landed on the asphalt, and sustained a fractured wrist and road rash on his left arm and shoulder. He was transported by ambulance. The car occupant is identified, insured, and has admitted she did not check her mirror before opening the door. What is the disposition?',
    options: [
      { option_text: 'Qualified — dooring is the car occupant\'s fault; occupants have a legal duty to check for cyclists before opening a door into traffic', is_correct: true },
      { option_text: 'Not Qualified — bicyclists are responsible for anticipating and avoiding car doors when riding near parked vehicles', is_correct: false },
      { option_text: 'Conditional — liability depends on whether the cyclist was riding in an officially marked and designated bike lane', is_correct: false },
      { option_text: 'Escalate — all bicycle versus vehicle accidents go to a supervisor before any intake determination is made', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Stephanie Hughes, calling about her own accident — right person. She was cycling in a bike lane when a vehicle ran a stop sign at an intersection and struck her front wheel, throwing her over the handlebars. The car drove off immediately and she has no plate or vehicle description beyond "a dark-colored sedan." However, she owns a car and her auto insurance policy — confirmed to include UM coverage — also extends to her as a cyclist. She was treated at urgent care for a concussion and fractured elbow. What is the disposition?',
    options: [
      { option_text: 'Qualified — her UM policy extends coverage to her as a cyclist struck by a hit-and-run; no identified defendant is required', is_correct: true },
      { option_text: 'Not Qualified — UM coverage only applies when the policyholder is physically inside their own insured vehicle at the time of impact', is_correct: false },
      { option_text: 'Conditional — must review the specific UM policy language to confirm it explicitly covers non-vehicle scenarios like cycling', is_correct: false },
      { option_text: 'Not Qualified — bicyclists need separate bicycle insurance for hit-and-run claims to be valid', is_correct: false },
    ],
  },
  // ── HIT-AND-RUN / UM ─────────────────────────────────────────────────────
  {
    question_text:
      'The caller is Sandra Mitchell, calling about her own accident — right person. She was driving on the highway when an unidentified vehicle sideswiped her and fled the scene. She pulled over safely and called police, who filed a hit-and-run report. She carries full coverage auto insurance that includes UM/UIM, confirmed active. She was treated for neck pain at urgent care the following morning. She was in her own vehicle at the time of the accident. What is the disposition?',
    options: [
      { option_text: 'Qualified — the caller has UM coverage; a documented hit-and-run with UM is a valid claim even without identifying the defendant', is_correct: true },
      { option_text: 'Not Qualified — hit-and-run cases require identifying the other driver and their insurance carrier before any claim can be processed', is_correct: false },
      { option_text: 'Conditional — must confirm a formal police report was filed before intake can be finalized; verify report status first', is_correct: false },
      { option_text: 'Escalate — all hit-and-run accidents need supervisor review and approval before intake can begin', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Thomas Reed, calling about his own accident — right person. He was hit by a driver who immediately fled the scene. Police responded but never located the driver. His auto insurance is liability-only — no UM, no MedPay, no UIM, nothing beyond the state minimum. He has no identified defendant and no applicable coverage. He was treated at urgent care for soft tissue back injuries. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — no UM coverage and no identified defendant means there is no viable avenue to recover any damages', is_correct: true },
      { option_text: 'Qualified — state law requires liability-only carriers to respond to hit-and-run claims regardless of the coverage type on the policy', is_correct: false },
      { option_text: 'Conditional — check if there is any household vehicle policy with UM coverage that he might qualify under', is_correct: false },
      { option_text: 'Escalate — all uninsured motorist situations with unclear recovery paths must go to a supervisor before disposition', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Angela Rivera, calling about her own accident — right person. She was rear-ended at a stop sign and the other driver fled immediately. She believes she has "full coverage" but is not certain whether UM is included — she says she would need to check her declarations page or call her carrier to confirm. She went to the ER the same night for neck pain and a possible concussion. There is no identified defendant. What is the disposition?',
    options: [
      { option_text: 'Conditional — the caller must verify UM coverage before intake can be finalized; flag the case as conditional pending UM confirmation', is_correct: true },
      { option_text: 'Not Qualified — uncertainty about UM coverage means the case cannot be accepted under any circumstances', is_correct: false },
      { option_text: 'Qualified — full coverage always includes UM by default so we can proceed without waiting for verification', is_correct: false },
      { option_text: 'Escalate — unknown UM status in a hit-and-run situation always requires supervisor review before any determination', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Catherine Moore, calling about her own accident — right person. She was rear-ended at a red light. The defendant showed his insurance card at the scene and it is documented on the police report. However, when our office contacted the insurer, they confirmed the policy had lapsed for non-payment nine days before the accident. Catherine carries full coverage auto insurance including UM and UIM, confirmed active. She has been treating for lower back and neck pain and has missed two weeks of work. What is the disposition?',
    options: [
      { option_text: 'Qualified — the defendant\'s lapsed policy makes him effectively uninsured; Catherine\'s UM coverage applies and the claim is fully viable', is_correct: true },
      { option_text: 'Not Qualified — if a valid insurance card was shown at the scene, the carrier must honor the claim regardless of any subsequent lapse', is_correct: false },
      { option_text: 'Conditional — must receive the insurer\'s formal written coverage denial letter before the case can proceed', is_correct: false },
      { option_text: 'Escalate — lapsed policy situations require supervisor verification and coverage analysis before intake is accepted', is_correct: false },
    ],
  },
  // ── UNINSURED DRIVER ─────────────────────────────────────────────────────
  {
    question_text:
      'The caller is Victor Hernandez, calling about his own accident — right person. He was struck head-on by a driver who crossed the center line. The at-fault driver is identified, insured, and the police report places full fault on the other driver. However, during intake Victor confirms he was driving without auto insurance on the date of the accident. The accident occurred in California. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — California Proposition 213 bars uninsured drivers from recovering non-economic damages; the personal injury claim is not viable', is_correct: true },
      { option_text: 'Qualified — the other driver was entirely at fault so the caller\'s own insurance status has no legal relevance to the claim', is_correct: false },
      { option_text: 'Conditional — accept if the injuries are severe enough to potentially trigger a Proposition 213 exception', is_correct: false },
      { option_text: 'Escalate — uninsured driver cases always require attorney review before a final determination, regardless of which state the accident occurred in', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Keisha Thompson, calling about her own accident — right person. She was stopped at a red light in Nevada when she was rear-ended by an insured driver. The police report cites only the defendant and fault is not in dispute. However, during intake Keisha confirms she did not carry auto insurance on the date of the accident. She has neck and back injuries and has been treating at a chiropractor for 10 days. Nevada has no statute equivalent to California\'s Proposition 213. What is the disposition?',
    options: [
      { option_text: 'Qualified — Nevada does not bar uninsured drivers from recovery; with clear liability and documented injuries the case is accepted', is_correct: true },
      { option_text: 'Not Qualified — uninsured drivers are universally barred from recovering personal injury damages in every state without exception', is_correct: false },
      { option_text: 'Conditional — Keisha must first obtain a valid auto insurance policy before the case can formally proceed', is_correct: false },
      { option_text: 'Escalate — any case involving an uninsured driver at the time of loss always requires supervisor review before disposition', is_correct: false },
    ],
  },
  // ── TREATMENT TIMING ─────────────────────────────────────────────────────
  {
    question_text:
      'The caller is Paul Roberts, calling about his own accident — right person. The accident happened 11 days ago. He went to the ER the same night and was diagnosed with cervical and lumbar strain. He was referred to physical therapy and has been attending three times per week ever since. He still has significant neck and back pain and his physical therapist says he has several more weeks of treatment ahead. The defendant was cited at the scene and liability is not in dispute. What is the disposition?',
    options: [
      { option_text: 'Qualified — same-day ER treatment, consistent physical therapy three times weekly, and an active ongoing treatment plan — all within normal parameters', is_correct: true },
      { option_text: 'Not Qualified — he waited too long; treatment must begin within 72 hours of the accident to qualify under our intake guidelines', is_correct: false },
      { option_text: 'Conditional — must confirm the physical therapy records specifically reference accident-related diagnoses before accepting', is_correct: false },
      { option_text: 'Escalate — any rear-end case still in active treatment at the 11-day mark requires supervisor review before intake', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Donna Kelley, calling about her own accident — right person. She was rear-ended three weeks ago and has significant shoulder and neck pain. She has not seen any doctor and has no medical records whatsoever. She says she doesn\'t like going to doctors and hoped the pain would go away on its own. She is calling now because the pain has gotten worse, not better. She wants to know if she can file a personal injury claim. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — three weeks post-accident with zero medical treatment or documentation means there is no medical record to support a personal injury claim', is_correct: true },
      { option_text: 'Qualified — the caller\'s verbal description of ongoing pain is sufficient to establish the foundation for a personal injury claim', is_correct: false },
      { option_text: 'Conditional — accept if she agrees to see a doctor within the next 48 hours and begins a formal treatment plan immediately', is_correct: false },
      { option_text: 'Escalate — all treatment-refusal cases must go to a supervisor before any determination is made', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Helen Murray, calling about her own accident — right person. She was in an accident 35 days ago. She says she had severe immediate pain but kept waiting, hoping it would resolve on its own. She finally went to urgent care yesterday — day 35 — for the very first time since the accident. This was her first medical contact of any kind. Liability is clear — she was rear-ended and the defendant is insured. She has no documented medical reason for the 35-day delay. What is the disposition?',
    options: [
      { option_text: 'Escalate — 35 days to first medical contact is outside the standard window; requires attorney evaluation for a possible serious-injury or documented-reason exception before accepting or rejecting', is_correct: true },
      { option_text: 'Not Qualified — any delay beyond 14 days from the accident to first treatment is an automatic and non-negotiable disqualifier', is_correct: false },
      { option_text: 'Qualified — she eventually sought treatment and that is sufficient to establish a valid treatment record', is_correct: false },
      { option_text: 'Conditional — accept if she provides a written and signed explanation of why she waited so long before seeking care', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Richard Hayes, calling about his own accident — right person. He was in an accident seven months ago and went to the ER on the day of the accident with neck and back pain. He then did nothing medically for the next four and a half months. He is now attempting to resume chiropractic treatment. When asked why there was such a long gap, he says he "just got busy" with work and family and had no medical reason for stopping care entirely. He wants to file a personal injury claim now. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — a four-and-a-half-month unexplained gap in treatment breaks the continuity of care required to support a personal injury claim', is_correct: true },
      { option_text: 'Qualified — the ER visit on the day of the accident is sufficient on its own to establish a valid and complete treatment record', is_correct: false },
      { option_text: 'Conditional — accept if he resumes consistent treatment immediately and provides a documented ongoing care plan going forward', is_correct: false },
      { option_text: 'Escalate — lengthy mid-treatment gaps always require supervisor evaluation before any disposition is given', is_correct: false },
    ],
  },
  // ── SLIP AND FALL ─────────────────────────────────────────────────────────
  {
    question_text:
      'The caller is Joan Russell, calling about her own accident — right person. She slipped and fell on a wet tile floor inside a supermarket. There were no wet floor warning cones or signs of any kind posted near the area. She fell directly onto her hip and could not get up — emergency services transported her to the ER where imaging revealed a fractured hip requiring surgical repair. The store manager completed an incident report on the spot. She has the incident report number and security cameras are pointed directly at the area where she fell. What is the disposition?',
    options: [
      { option_text: 'Qualified — wet floor with no warning signs, a fractured hip requiring surgery, a documented incident report, and camera coverage all establish clear premises liability', is_correct: true },
      { option_text: 'Not Qualified — retail stores cannot be held liable for wet floors that result naturally from customer foot traffic', is_correct: false },
      { option_text: 'Conditional — must independently verify that no warning signs were posted anywhere near the spill before the case can be accepted', is_correct: false },
      { option_text: 'Escalate — all slip-and-fall cases must be reviewed by a supervisor before any intake is completed', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Howard Griffin, calling about his own accident — right person. He fell in a grocery store parking lot. When asked what caused the fall, he says he isn\'t sure — he just "went down." He describes the pavement as completely dry and level with no cracks, no raised edges, no potholes, and no visible debris. He believes he may have simply lost his balance. He has a sprained wrist and bruised knee. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — no identifiable property hazard means no established negligence by the property owner; an unexplained fall on dry, level ground is not a viable premises liability claim', is_correct: true },
      { option_text: 'Qualified — property owners are responsible for any injury that occurs anywhere on their premises regardless of cause', is_correct: false },
      { option_text: 'Conditional — accept if he can locate a witness who observed exactly what caused him to fall before he hit the ground', is_correct: false },
      { option_text: 'Escalate — all unexplained falls on commercial property require attorney investigation before any rejection is given', is_correct: false },
    ],
  },
  // ── DOG BITE ──────────────────────────────────────────────────────────────
  {
    question_text:
      'The caller is Nathan Price, calling about his own accident — right person. He was visiting a neighbor\'s home when the neighbor\'s German Shepherd lunged unprovoked and bit him deeply on the forearm and thigh. He was transported to the ER where the wounds required 14 stitches and he began a rabies prophylaxis series. He did nothing to provoke the dog — he was simply standing in the entryway when it attacked. The neighbor carries an active homeowners insurance policy that covers dog bites. What is the disposition?',
    options: [
      { option_text: 'Qualified — unprovoked dog bite requiring ER treatment and stitches, identified owner, and active homeowners coverage is a standard dog bite claim', is_correct: true },
      { option_text: 'Not Qualified — the caller was voluntarily on the dog owner\'s property and assumed the inherent risk of being near the animal', is_correct: false },
      { option_text: 'Conditional — must confirm in detail that the caller did nothing to agitate or provoke the dog before accepting the case', is_correct: false },
      { option_text: 'Escalate — all dog bite incidents go to a supervisor before any intake decision is finalized', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Christine Bell, calling about her own accident — right person. She was walking on a public sidewalk when a stray dog with no collar ran out from an alley and nipped at her ankle. The bite barely broke the skin and required no medical treatment — she cleaned it at home with antiseptic. The dog ran off and no owner was ever identified. Animal control has no record matching the animal. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — no identifiable owner and a minor injury requiring no medical treatment means there is no viable claim to pursue', is_correct: true },
      { option_text: 'Qualified — the city or county is responsible for all stray animal incidents that occur on public sidewalks and property', is_correct: false },
      { option_text: 'Qualified — she can file a claim through local animal control\'s municipal liability insurance program', is_correct: false },
      { option_text: 'Escalate — all animal attack incidents must go to a supervisor before any disposition is given', is_correct: false },
    ],
  },
  // ── MINORS ────────────────────────────────────────────────────────────────
  {
    question_text:
      'The caller is Laura Bishop, calling about her own accident — right person. She was rear-ended at a stoplight in Nevada. Her 9-year-old daughter was in the back seat and appears to have no injuries — no bruising, no complaints of pain, and normal movement observed at the scene. Laura sustained soft tissue neck and back injuries and has been treating at a chiropractor for a week. She wants to include her daughter in the claim since her daughter was also a passenger in the vehicle. Nevada allows an injured adult to sign for an uninjured minor in the same accident. What is the disposition?',
    options: [
      { option_text: 'Qualified — Nevada allows an injured adult to sign for an uninjured minor passenger in the same accident; include the daughter', is_correct: true },
      { option_text: 'Not Qualified — uninjured minors cannot be included in any personal injury claim under any circumstances in any state', is_correct: false },
      { option_text: 'Escalate — any case involving a minor automatically escalates to a supervisor regardless of whether the minor has injuries', is_correct: false },
      { option_text: 'Conditional — wait 30 days to confirm the daughter develops no delayed injury symptoms before deciding whether to include her in the claim', is_correct: false },
    ],
  },
  {
    question_text:
      'A mother is calling on behalf of her 10-year-old son — wrong person calling for the injured minor. Her son was a passenger in his uncle\'s car when the uncle was rear-ended at a red light. The uncle was not injured. The boy has neck pain and a possible concussion and was evaluated at urgent care. The mother, who was not in the vehicle and was not injured herself, is calling to file a claim for her son\'s injuries. The accident occurred in California. What is the disposition?',
    options: [
      { option_text: 'Escalate — California does not allow a non-injured adult to sign for an injured minor; the case must be handled by an attorney through the proper court filing process', is_correct: true },
      { option_text: 'Qualified — a parent or legal guardian can sign for an injured minor in all states under all circumstances without restriction', is_correct: false },
      { option_text: 'Not Qualified — minors cannot file personal injury claims and must wait until they turn 18 before pursuing any claim', is_correct: false },
      { option_text: 'Conditional — the non-injured mother may sign as guardian in most situations but must first provide notarized proof of legal guardianship', is_correct: false },
    ],
  },
  // ── MISC ──────────────────────────────────────────────────────────────────
  {
    question_text:
      'The caller is Daniel Fisher, calling about his own accident — right person. He was driving on a two-lane highway at night when a large deer ran across the road and he struck it at highway speed. The impact was severe — significant front-end damage and the airbags deployed. He has chest soreness from the airbag and a cut on his hand from the steering wheel. He carries comprehensive coverage on his vehicle but confirms he has no UM. He wants to know who is responsible and whether he can file a personal injury claim against anyone. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — a deer strike is a natural occurrence with no actionable defendant; this is a comprehensive auto insurance property claim, not a personal injury case against any party', is_correct: true },
      { option_text: 'Qualified — the state transportation department may be liable for failing to maintain adequate wildlife crossing signage on that highway', is_correct: false },
      { option_text: 'Conditional — accept only if a government-posted wildlife warning sign was confirmed absent or missing at the exact location of the strike', is_correct: false },
      { option_text: 'Escalate — single-vehicle animal collision incidents require supervisor determination before any disposition is given', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller is Sharon Cole, calling about her own accident — right person. She was in an auto accident nine months ago. After the accident, the defendant\'s insurer sent her a property damage settlement check, which she endorsed and cashed to repair her vehicle. She never signed any general release of claims, any liability waiver, or any all-inclusive settlement agreement — only the check itself. She has an open bodily injury claim that was never discussed as part of the property damage settlement and has never been resolved. She has ongoing medical treatment and wants to pursue her injury claim now. What is the disposition?',
    options: [
      { option_text: 'Qualified — cashing a property damage check does not release a bodily injury claim as long as no full general release was signed; the injury claim remains completely viable', is_correct: true },
      { option_text: 'Not Qualified — cashing any settlement check from the defendant\'s insurer permanently releases all claims arising from that same accident', is_correct: false },
      { option_text: 'Conditional — must have an attorney review the check endorsement and any accompanying correspondence before the bodily injury case can move forward', is_correct: false },
      { option_text: 'Escalate — any caller who has already received and cashed money from the defendant\'s insurer must always be escalated to a supervisor before intake', is_correct: false },
    ],
  },
]

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const force = url.searchParams.get('force') === 'true'

  const { data: existing } = await admin
    .from('modules')
    .select('id')
    .eq('title', 'Nuance Book Exam')
    .maybeSingle()

  if (existing) {
    if (!force) {
      return NextResponse.json({ error: 'Exam already exists', moduleId: existing.id }, { status: 409 })
    }
    await admin.from('modules').delete().eq('id', existing.id)
  }

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
    return NextResponse.json({ error: moduleError?.message ?? 'Failed to create module' }, { status: 500 })
  }

  const moduleId: string = newModule.id

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i]
    const { data: newQuestion, error: questionError } = await admin
      .from('questions')
      .insert({ module_id: moduleId, question_text: q.question_text, position: i + 1 })
      .select()
      .single()

    if (questionError || !newQuestion) continue

    await admin.from('options').insert(
      q.options.map((opt, oi) => ({
        question_id: newQuestion.id,
        option_text: opt.option_text,
        is_correct: opt.is_correct,
        position: oi + 1,
      }))
    )
  }

  return NextResponse.json({ success: true, moduleId })
}
