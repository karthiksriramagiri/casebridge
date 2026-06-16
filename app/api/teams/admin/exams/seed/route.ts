import { NextResponse } from 'next/server'
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
  {
    question_text:
      'A caller says she was stopped at a red light when the car behind her failed to brake and struck her vehicle from behind. Her car has visible rear-end damage. She sought treatment at an urgent care clinic the same day. The defendant has active insurance. What is the disposition?',
    options: [
      { option_text: 'Qualified — clean rear-end with damage, same-day treatment, insured defendant', is_correct: true },
      { option_text: 'Not Qualified — she needs to have been injured for more than 30 days before calling', is_correct: false },
      { option_text: 'Conditional — must confirm she wasn\'t in a prior accident recently', is_correct: false },
      { option_text: 'Escalate — all rear-end cases must go to a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was rear-ended at a red light. He says there is no visible damage to either vehicle, but he has neck stiffness that started the next morning. He went to his doctor two days later. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — no visible damage to either vehicle means no case', is_correct: false },
      { option_text: 'Qualified — injury alone is sufficient regardless of property damage', is_correct: false },
      { option_text: 'Conditional — zero visible damage on both vehicles requires supervisory review', is_correct: true },
      { option_text: 'Escalate — soft tissue with no property damage is always escalated', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller says she was \'rear-ended\' and wants to file a claim. During intake, she reveals all the damage is on the front bumper, not the rear. She cannot explain the discrepancy. What is the disposition?',
    options: [
      { option_text: 'Qualified — the caller\'s subjective account controls the liability determination', is_correct: false },
      { option_text: 'Not Qualified — damage on the front contradicts the rear-end account; the story doesn\'t hold up', is_correct: true },
      { option_text: 'Conditional — proceed but flag for attorney review', is_correct: false },
      { option_text: 'Escalate — conflicting damage location always requires a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was the middle car in a 3-car chain-reaction accident. The rear car hit her vehicle, which was then pushed into the front car. She did not apply brakes suddenly or cause the initial impact. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — she contributed to striking the front car', is_correct: false },
      { option_text: 'Qualified — she was pushed by the rear driver and bears no fault for the chain reaction', is_correct: true },
      { option_text: 'Conditional — chain reactions always require supervisor review', is_correct: false },
      { option_text: 'Escalate — multi-vehicle accidents must go to a senior rep', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller says he was rear-ended after intentionally brake-checking a tailgating driver. He recorded the entire incident, including the tailgating, on his dashcam. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — intentional brake-checking eliminates any possible claim', is_correct: false },
      { option_text: 'Qualified — the defendant still rear-ended him and is liable', is_correct: false },
      { option_text: 'Escalate — intentional brake-check cases with dashcam evidence need attorney evaluation', is_correct: true },
      { option_text: 'Conditional — proceed only if the brake-check wasn\'t the sole cause of the crash', is_correct: false },
    ],
  },
  {
    question_text:
      'The defendant made an unprotected left turn in front of the caller\'s vehicle, which was traveling straight through an intersection at the legal speed limit. The police report places fault on the left-turning driver. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — unprotected left turns are always the caller\'s fault', is_correct: false },
      { option_text: 'Qualified — defendant making an unprotected left in front of a vehicle going straight is classic at-fault liability', is_correct: true },
      { option_text: 'Conditional — need to confirm whether defendant had a protected arrow', is_correct: false },
      { option_text: 'Escalate — all T-bone collisions need attorney review', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller made an unprotected left turn and was struck by oncoming traffic traveling straight. The caller says the light was yellow when she turned. No witnesses and only soft tissue injuries. What is the disposition?',
    options: [
      { option_text: 'Qualified — a yellow light gives her the right of way to turn', is_correct: false },
      { option_text: 'Not Qualified — the caller made the left turn and is the at-fault party with no evidence to establish liability', is_correct: true },
      { option_text: 'Conditional — proceed if she can obtain footage from nearby business cameras', is_correct: false },
      { option_text: 'Escalate — yellow light disputes require a supervisor decision', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was a passenger in a vehicle that made an unprotected left turn, causing a fatal accident. The passenger (now deceased) was the caller\'s family member. The at-fault driver was also in the vehicle. The family is calling about the deceased passenger. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the driver was at fault so passengers cannot recover', is_correct: false },
      { option_text: 'Qualified — passengers can always recover regardless of the driver\'s fault', is_correct: false },
      { option_text: 'Escalate — wrongful death of a passenger in an at-fault vehicle requires attorney review due to complexity and exception rules', is_correct: true },
      { option_text: 'Conditional — depends on whether the passenger was related to the driver', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was traveling in a clearly established lane on the freeway when a vehicle from an adjacent lane merged into her lane without signaling, sideswiping her. She maintained her lane position throughout. Police report confirms this. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — sideswipes are always shared-fault incidents', is_correct: false },
      { option_text: 'Qualified — defendant merged into an established lane; caller held her position', is_correct: true },
      { option_text: 'Conditional — need to confirm she had been in the lane for more than 100 feet', is_correct: false },
      { option_text: 'Escalate — freeway accidents always require escalation', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller is merging from an on-ramp onto the freeway. During the merge, a car in the travel lane sideswiped her. The caller admits she was the one merging onto the freeway at the time. What is the disposition?',
    options: [
      { option_text: 'Qualified — the other driver should have yielded to the merging vehicle', is_correct: false },
      { option_text: 'Not Qualified — the caller was the merging driver; merging vehicles must yield to established traffic', is_correct: true },
      { option_text: 'Conditional — proceed if a witness confirms the freeway driver was speeding', is_correct: false },
      { option_text: 'Escalate — all freeway merge accidents go to a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller says she had the green light when the defendant ran the red and T-boned her. The police report lists an independent witness — not a passenger or family member — who corroborates that the caller had the green light. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — light disputes without traffic cameras are never accepted', is_correct: false },
      { option_text: 'Qualified — an independent witness on the police report resolves the light dispute in the caller\'s favor', is_correct: true },
      { option_text: 'Conditional — caller must also provide photo evidence of the damage', is_correct: false },
      { option_text: 'Escalate — traffic light disputes always need supervisor approval', is_correct: false },
    ],
  },
  {
    question_text:
      'Both the caller and the defendant claim they had the green light. There are no witnesses, no traffic cameras, and no police report. Neither party can substantiate their account. What is the disposition?',
    options: [
      { option_text: 'Qualified — the caller\'s account is taken at face value', is_correct: false },
      { option_text: 'Conditional — accept if a nearby business might have security footage', is_correct: false },
      { option_text: 'Not Qualified — unresolvable he-said/she-said light dispute with zero corroborating evidence disqualifies the case', is_correct: true },
      { option_text: 'Escalate — tied liability decisions go to a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was driving on a main boulevard when a vehicle pulled out of a residential side street — which had a stop sign — and struck the front of the caller\'s car. The side street driver ran the stop sign. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — right-of-way disputes are inherently 50/50', is_correct: false },
      { option_text: 'Escalate — side street vs. boulevard accidents always escalate', is_correct: false },
      { option_text: 'Qualified — driver on the side street had the stop sign and failed to yield to boulevard traffic', is_correct: true },
      { option_text: 'Conditional — need to confirm the stop sign was visible and the caller was at the speed limit', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller pulled out of a driveway and was struck by a vehicle on the main road. The caller admits she didn\'t see the oncoming car before pulling out. She is asking if she has a case. What is the disposition?',
    options: [
      { option_text: 'Qualified — vehicles on driveways have shared right of way with the main road', is_correct: false },
      { option_text: 'Not Qualified — the caller was the one pulling out and failed to yield; she is the at-fault party', is_correct: true },
      { option_text: 'Conditional — can proceed if the oncoming driver was demonstrably speeding', is_correct: false },
      { option_text: 'Escalate — single-fault driveway accidents require escalation', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was driving when a police cruiser with lights and sirens active entered an intersection against the red and struck her vehicle. She does not have UM coverage on her policy. What is the disposition?',
    options: [
      { option_text: 'Qualified — the police car ran the red light and is clearly at fault', is_correct: false },
      { option_text: 'Not Qualified — government vehicles operating with lights and sirens active have statutory right of way; without UM there is no recovery path', is_correct: true },
      { option_text: 'Conditional — accept if the police department lacks sovereign immunity in this jurisdiction', is_correct: false },
      { option_text: 'Escalate — all police vehicle accidents must be escalated', is_correct: false },
    ],
  },
  {
    question_text:
      'A police vehicle running lights and sirens struck another car in an intersection. That car was then pushed into the caller\'s vehicle. The caller was completely uninvolved in the first impact. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the police car had lights and sirens so all resulting impacts are excluded', is_correct: false },
      { option_text: 'Qualified — caller was a third party pushed by the chain reaction; she is not a direct victim of the government vehicle and the right-of-way exception does not shield the secondary impact to her', is_correct: true },
      { option_text: 'Conditional — only if the caller has UM coverage', is_correct: false },
      { option_text: 'Escalate — any accident involving a police vehicle requires supervisor review', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was hit by a city-owned utility truck 5 months ago in California. The statute of limitations for government tort claims in California requires filing within 6 months of the incident. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — city vehicles are never actionable', is_correct: false },
      { option_text: 'Qualified — 5 months is well within the standard statute of limitations', is_correct: false },
      { option_text: 'Escalate — California government claims have a 6-month SOL; at 5 months the clock is running critically short and needs urgent attorney review', is_correct: true },
      { option_text: 'Conditional — proceed only if the caller has UM coverage', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was rear-ended by a USPS mail truck. The driver was in an official USPS vehicle making deliveries. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — federal vehicles are absolutely immune from all personal injury claims', is_correct: false },
      { option_text: 'Qualified — USPS cases are handled like commercial vehicle cases with no additional requirements', is_correct: false },
      { option_text: 'Escalate — USPS is a federal entity requiring special claim procedures; do not reject solo — needs attorney handling', is_correct: true },
      { option_text: 'Conditional — accept only if the driver was clearly negligent per the police report', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was a passenger on a city bus. A car ran a red light and struck the bus. The bus driver was not at fault. The caller sustained soft tissue injuries from the impact. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — bus passengers can only claim through the bus company\'s insurance', is_correct: false },
      { option_text: 'Qualified — a third-party vehicle caused the accident; the caller has a clear liability case against the at-fault car driver', is_correct: true },
      { option_text: 'Conditional — depends on whether the bus company agrees to cooperate with discovery', is_correct: false },
      { option_text: 'Escalate — all bus accidents require escalation', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was a passenger on a bus that braked suddenly to avoid hitting another car. The caller was thrown forward and has back soreness. There was no collision — the bus successfully avoided the other vehicle. What is the disposition?',
    options: [
      { option_text: 'Qualified — the other car\'s dangerous driving caused the incident', is_correct: false },
      { option_text: 'Not Qualified — no collision occurred; soft tissue from a non-collision braking event on a bus is not accepted', is_correct: true },
      { option_text: 'Conditional — accept if the bus company confirms the other driver was at fault', is_correct: false },
      { option_text: 'Escalate — sudden-braking bus incidents go to a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was a passenger in a car driven by her husband. Her husband ran a stop sign and caused the accident. The caller was injured. They live together. What is the disposition?',
    options: [
      { option_text: 'Qualified — spouses can always sue each other for negligence in any state', is_correct: false },
      { option_text: 'Qualified — as a passenger she bears no liability for the accident', is_correct: false },
      { option_text: 'Not Qualified — the at-fault driver is a household member (spouse); the household exclusion applies', is_correct: true },
      { option_text: 'Conditional — proceed if they file for separation first', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was a passenger in a friend\'s vehicle. The friend is not related to the caller and does not live with him. The friend caused the accident through negligent driving. The caller was injured. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — passengers cannot recover from the driver of the vehicle they were riding in', is_correct: false },
      { option_text: 'Qualified — the driver is not a household member; the caller as a passenger can recover from the driver\'s liability', is_correct: true },
      { option_text: 'Conditional — must first confirm the friend carries liability insurance', is_correct: false },
      { option_text: 'Escalate — passenger-vs-driver cases require attorney review', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was a passenger in his fiancée\'s car when she caused an accident, injuring him. They are engaged but live in separate apartments in different cities. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — engaged couples are treated the same as married couples for the household exclusion', is_correct: false },
      { option_text: 'Not Qualified — all romantic partners are considered household members regardless of address', is_correct: false },
      { option_text: 'Qualified — they do not share a residence; the household exclusion does not apply', is_correct: true },
      { option_text: 'Conditional — depends on how long they have been engaged', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was injured as a passenger in a car driven by her 24-year-old son, who was at fault. The son lives with her at the same address and is listed on her insurance policy. What is the disposition?',
    options: [
      { option_text: 'Qualified — adult children are legally independent regardless of where they live', is_correct: false },
      { option_text: 'Not Qualified — the at-fault son is a household member (adult child sharing the same residence); the household exclusion applies', is_correct: true },
      { option_text: 'Conditional — depends on whether the son pays rent', is_correct: false },
      { option_text: 'Escalate — parent-child accidents always go to a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was a passenger in her 22-year-old daughter\'s car. The daughter caused an accident. The daughter lives in her own apartment in another city and has her own lease. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — parent-child relationships always trigger the household member exclusion', is_correct: false },
      { option_text: 'Qualified — the daughter does not reside with the caller; she is not a household member and the exclusion does not apply', is_correct: true },
      { option_text: 'Conditional — must confirm the daughter is fully financially independent', is_correct: false },
      { option_text: 'Escalate — family member accidents always require supervisor review', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was a passenger in an Uber. A third-party vehicle ran a red light and struck the Uber. The Uber driver was not at fault. The caller sustained soft tissue injuries. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — Uber passengers can only claim through Uber\'s commercial policy', is_correct: false },
      { option_text: 'Qualified — the third-party vehicle is at fault; the caller has a clear claim against the at-fault driver', is_correct: true },
      { option_text: 'Conditional — must confirm Uber\'s commercial policy was active at the time', is_correct: false },
      { option_text: 'Escalate — all rideshare accidents go to a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was an Uber passenger. Without any other vehicle involved, the Uber driver veered off the road and struck a median barrier. The caller was injured. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — single-car accidents by an Uber are never covered because there is no third-party defendant', is_correct: false },
      { option_text: 'Qualified — Uber maintains significant commercial insurance that covers passenger claims even in single-vehicle crashes', is_correct: true },
      { option_text: 'Conditional — depends on whether the Uber app was in active trip status at the time of the crash', is_correct: false },
      { option_text: 'Not Qualified — the caller would need to sue Uber directly and that is not handled here', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was an Uber passenger. The Uber driver braked hard to avoid a car that pulled out, but successfully avoided any collision. No contact occurred. The caller has neck soreness from the jolt. What is the disposition?',
    options: [
      { option_text: 'Qualified — the car that pulled out was negligent and caused the incident', is_correct: false },
      { option_text: 'Not Qualified — no collision occurred; a hard brake with no contact in a rideshare vehicle is not accepted', is_correct: true },
      { option_text: 'Conditional — accept if the caller sought emergency room treatment', is_correct: false },
      { option_text: 'Escalate — rideshare braking incidents go to a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was walking in a marked crosswalk with the pedestrian walk signal when a vehicle turning right on red struck her. She was transported to the ER. The driver is identified and insured. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — pedestrians are assumed to be partially at fault in vehicle collisions', is_correct: false },
      { option_text: 'Qualified — the pedestrian had the right of way in a marked crosswalk with the walk signal; the driver failed to yield', is_correct: true },
      { option_text: 'Conditional — must confirm the crosswalk was properly marked and maintained', is_correct: false },
      { option_text: 'Escalate — all pedestrian-vehicle strikes require escalation', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was struck by a hit-and-run driver while walking. The driver fled. The caller does not own a vehicle and has no auto insurance policy of any kind. What is the disposition?',
    options: [
      { option_text: 'Qualified — pedestrians do not need auto insurance to make claims against at-fault drivers', is_correct: false },
      { option_text: 'Not Qualified — hit-and-run pedestrian with no UM coverage of any kind and no identifiable defendant has no recovery path', is_correct: true },
      { option_text: 'Conditional — look for a household member\'s auto policy with UM', is_correct: false },
      { option_text: 'Escalate — all hit-and-run pedestrian cases require a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was riding his bicycle and was struck by a car door that swung open suddenly as he passed a parked car. He was thrown from his bike and has soft tissue injuries. The car occupant is identified. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — bicyclists are responsible for avoiding car doors in parked lanes', is_correct: false },
      { option_text: 'Qualified — the car occupant has a duty to check for traffic before opening the door; \'dooring\' is the occupant\'s fault', is_correct: true },
      { option_text: 'Conditional — depends on whether the caller was in a designated bike lane', is_correct: false },
      { option_text: 'Escalate — all bicycle accidents require supervisor review', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was riding her bicycle when an unidentified driver struck her and fled the scene. She has an auto insurance policy with UM coverage on her personal vehicle. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — UM coverage only applies when the insured is inside their vehicle', is_correct: false },
      { option_text: 'Qualified — the caller\'s UM policy covers her as a bicyclist struck by an uninsured or hit-and-run driver', is_correct: true },
      { option_text: 'Conditional — must confirm the UM policy language specifically covers non-vehicle incidents', is_correct: false },
      { option_text: 'Not Qualified — bicyclists need separate bicycle insurance for this type of claim', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was hit by an unidentified vehicle that fled the scene. The caller has full coverage auto insurance that includes UM/UIM. She was in her vehicle at the time. She is not at fault. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — hit-and-run cases cannot be processed without identifying the other driver', is_correct: false },
      { option_text: 'Qualified — caller has UM; hit-and-run with UM coverage is a valid claim', is_correct: true },
      { option_text: 'Conditional — must file a police report before any intake can be completed', is_correct: false },
      { option_text: 'Escalate — hit-and-run always requires supervisor approval', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was hit by a driver who fled the scene. The caller\'s auto policy is liability-only with no UM coverage. She cannot identify the hit-and-run driver. What is the disposition?',
    options: [
      { option_text: 'Qualified — she can file a claim through her own liability insurer', is_correct: false },
      { option_text: 'Conditional — look for another potential source of recovery', is_correct: false },
      { option_text: 'Not Qualified — no UM and no identified defendant means no path to recover damages', is_correct: true },
      { option_text: 'Escalate — all uninsured motorist situations require escalation', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was hit by a driver who fled the scene. He has full coverage but is not certain whether his policy includes UM — he needs to check his declarations page. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — uncertainty about UM coverage means the case cannot proceed', is_correct: false },
      { option_text: 'Qualified — assume full coverage always includes UM by default', is_correct: false },
      { option_text: 'Conditional — caller must verify UM status before proceeding; flag as conditional pending confirmation', is_correct: true },
      { option_text: 'Escalate — unknown insurance status requires supervisor review', is_correct: false },
    ],
  },
  {
    question_text:
      'The defendant\'s insurance card was shown on the police report, but the insurer confirms the policy lapsed two weeks before the accident. The caller has UM on her own policy. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — if the defendant had an insurance card at the scene, there must be valid coverage', is_correct: false },
      { option_text: 'Qualified — lapsed policy means the defendant is effectively uninsured; the caller\'s UM coverage applies', is_correct: true },
      { option_text: 'Conditional — must wait for the insurer\'s final investigation to formally confirm the lapse', is_correct: false },
      { option_text: 'Escalate — lapsed policy cases go to a supervisor for coverage verification', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was driving without auto insurance in California when he was rear-ended by an insured driver. The defendant is clearly at fault. What is the disposition?',
    options: [
      { option_text: 'Qualified — he was not at fault and the liability is clear', is_correct: false },
      { option_text: 'Not Qualified — California Proposition 213 bars an uninsured driver from recovering non-economic damages; the case is not viable', is_correct: true },
      { option_text: 'Conditional — proceed if he has medical documentation of his injuries', is_correct: false },
      { option_text: 'Escalate — uninsured driver cases need attorney review regardless of fault', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was driving without insurance in Nevada when a defendant rear-ended her at a red light. Liability is clear and the defendant is insured. Nevada does not have a law equivalent to California\'s Proposition 213. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — all uninsured drivers are universally barred from recovery', is_correct: false },
      { option_text: 'Qualified — Nevada does not bar uninsured drivers from recovery; accept if liability and damages are solid', is_correct: true },
      { option_text: 'Conditional — the caller must obtain insurance before the case can proceed', is_correct: false },
      { option_text: 'Escalate — out-of-state uninsured drivers always require supervisor review', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller was in an accident 10 days ago. He went to an urgent care clinic the day after the accident and has been treating consistently since. He is still within the treatment window. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — he waited too long before seeking medical attention', is_correct: false },
      { option_text: 'Not Qualified — only emergency room treatment on the day of the accident qualifies', is_correct: false },
      { option_text: 'Qualified — treated within the window and treating consistently; fully within parameters', is_correct: true },
      { option_text: 'Conditional — need to confirm the urgent care records specifically document accident-related injuries', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was in an accident two weeks ago. She has neck and back pain but refuses to see a doctor, saying she \'doesn\'t like doctors.\' She has no medical documentation of any kind. What is the disposition?',
    options: [
      { option_text: 'Qualified — subjective pain reports are sufficient to establish a claim', is_correct: false },
      { option_text: 'Conditional — accept if she agrees to see a doctor within the next 7 days', is_correct: false },
      { option_text: 'Not Qualified — without any medical treatment or documentation there is no record to support a personal injury claim', is_correct: true },
      { option_text: 'Escalate — treatment refusal cases require supervisor decision', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was injured in an accident but did not seek any medical treatment for 31 days. She finally visited a doctor for the first time on day 31. This is her very first medical contact since the accident. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — any gap beyond 14 days from the accident is an automatic disqualifier', is_correct: false },
      { option_text: 'Qualified — she eventually got treatment and that is all that matters', is_correct: false },
      { option_text: 'Escalate — a 31-day delay to first treatment is outside the normal window; requires attorney evaluation for a potential big-injury or documented-reason exception', is_correct: true },
      { option_text: 'Conditional — accept if she provides a written reason for the delay', is_correct: false },
    ],
  },
  {
    question_text:
      'The caller went to the ER on the day of the accident, then did nothing medically for 4 months. She now wants to resume treatment. When asked, she says there was no medical reason for the gap — she simply \'got busy.\' What is the disposition?',
    options: [
      { option_text: 'Qualified — the ER visit on day 1 is sufficient to establish a treatment record', is_correct: false },
      { option_text: 'Not Qualified — a 4-month unexplained gap breaks the required continuity of treatment', is_correct: true },
      { option_text: 'Conditional — accept if she resumes treatment immediately and commits to continuing', is_correct: false },
      { option_text: 'Escalate — mid-treatment gaps always go to a supervisor for case evaluation', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller slipped on a wet floor at a grocery store. There were no wet floor warning signs posted. She required ambulance transport to the ER and an incident report was filed with the store manager. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — stores cannot be held liable for naturally wet floors', is_correct: false },
      { option_text: 'Conditional — must independently confirm no signs were posted before proceeding', is_correct: false },
      { option_text: 'Qualified — wet floor with no warning signs, a written incident report, and ER treatment establishes clear liability and damages', is_correct: true },
      { option_text: 'Escalate — all slip-and-fall cases require supervisor review', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller says he \'just fell\' in a parking lot. He cannot identify what caused him to fall — no wet surface, no pothole, no visible hazard. He simply lost his balance and fell on level ground. What is the disposition?',
    options: [
      { option_text: 'Qualified — the property owner is always responsible for falls that occur on their premises', is_correct: false },
      { option_text: 'Conditional — proceed if he seeks medical treatment and finds a cause later', is_correct: false },
      { option_text: 'Not Qualified — no identifiable hazard means no established negligence by the property owner', is_correct: true },
      { option_text: 'Escalate — unexplained falls require attorney review to investigate possible hidden hazards', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was bitten by a neighbor\'s dog while visiting the neighbor\'s home. The bite required stitches at the ER. The dog owner is clearly identified. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — the caller was voluntarily on the dog owner\'s property and assumed the risk', is_correct: false },
      { option_text: 'Qualified — a dog bite requiring stitches with an identified owner is a standard dog bite claim', is_correct: true },
      { option_text: 'Conditional — depends on whether the caller did anything to provoke the dog', is_correct: false },
      { option_text: 'Escalate — all dog bite incidents go to a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller was bitten by a stray dog. The dog ran off and no owner could be identified. The bite broke the skin but did not require stitches. What is the disposition?',
    options: [
      { option_text: 'Qualified — the city or county is responsible for stray dog incidents on public property', is_correct: false },
      { option_text: 'Qualified — the caller can file a claim through animal control', is_correct: false },
      { option_text: 'Not Qualified — no identifiable owner combined with a minor injury that did not require stitches means no viable claim', is_correct: true },
      { option_text: 'Escalate — all animal attack incidents go to a supervisor', is_correct: false },
    ],
  },
  {
    question_text:
      'An adult caller was in an accident in Nevada. Her 8-year-old child was also in the car but appears uninjured. The adult caller was injured. She wants to include her child in the case. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — uninjured minors cannot be included in a personal injury case under any circumstances', is_correct: false },
      { option_text: 'Escalate — any case involving a minor automatically requires escalation to a supervisor', is_correct: false },
      { option_text: 'Qualified — Nevada allows an injured adult to sign for an uninjured minor passenger in the same accident; include the minor', is_correct: true },
      { option_text: 'Conditional — must wait 30 days to determine if the child develops any delayed symptoms', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller in California says her 12-year-old child was injured in a car accident. The mother was not in the vehicle and was not injured. She wants to file a claim for her child. What is the disposition?',
    options: [
      { option_text: 'Qualified — parents can sign for injured children in all states without restriction', is_correct: false },
      { option_text: 'Not Qualified — minors cannot file any claims; they must wait until they turn 18', is_correct: false },
      { option_text: 'Conditional — the non-injured mother may sign as legal guardian in most situations', is_correct: false },
      { option_text: 'Escalate — California does not allow a non-injured adult to sign for an injured minor; the case requires attorney handling to file properly', is_correct: true },
    ],
  },
  {
    question_text:
      'A caller hit a deer that darted onto the highway, causing significant front-end damage to his vehicle. He has comprehensive coverage but no UM coverage. He is asking about filing a personal injury claim. What is the disposition?',
    options: [
      { option_text: 'Qualified — the deer\'s presence on a state highway means the transportation department may be liable', is_correct: false },
      { option_text: 'Not Qualified — deer strikes are natural occurrences; this is a comprehensive insurance claim, not a personal injury case against any party', is_correct: true },
      { option_text: 'Conditional — can pursue a claim if a government warning sign was absent at the location', is_correct: false },
      { option_text: 'Escalate — all single-car animal incidents require escalation', is_correct: false },
    ],
  },
  {
    question_text:
      'A caller received a property damage settlement check from the defendant\'s insurer and has already cashed it. She did not sign any full general release. She still has an open bodily injury claim from the same accident and has not settled the injury portion. What is the disposition?',
    options: [
      { option_text: 'Not Qualified — cashing any settlement check from the defendant\'s insurer releases all claims from that accident', is_correct: false },
      { option_text: 'Qualified — cashing a property damage check does not release the bodily injury claim as long as no full release document was signed; the injury claim remains viable', is_correct: true },
      { option_text: 'Conditional — must have an attorney verify that the check did not contain release language before proceeding', is_correct: false },
      { option_text: 'Escalate — any caller who has already received money from the defendant\'s insurer must be escalated', is_correct: false },
    ],
  },
]

export async function POST() {
  // Auth check via server client
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Check if exam already exists
  const { data: existing } = await admin
    .from('modules')
    .select('id')
    .eq('title', 'Nuance Book Exam')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Exam already exists', moduleId: existing.id }, { status: 409 })
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
