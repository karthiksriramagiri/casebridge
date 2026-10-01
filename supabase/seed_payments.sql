-- ─────────────────────────────────────────────────────────────────────────────
-- Payments seed — agency transactions export, 23 Feb 2026 → 11 Sep 2026
--
-- Generated from the processor's own export. Keyed on its order id, so running
-- this again after a fresh export inserts only what is new.
-- Run migration_payments.sql first.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO payments
  (payment_id, paid_at, gross, net, refunded, status, payer_name, payer_domain, product, case_count)
VALUES
  ('ORD-C4HH-VSWR-XESY', '2026-09-11T11:23:00+00'::timestamptz, 6500.00, 6310.53, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 1 Case', 1),
  ('ORD-X28Y-HAYS-JFS3', '2026-09-11T11:20:00+00'::timestamptz, 35000.00, 33984.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 10 Cases', 10),
  ('ORD-VADK-CP12-4JZZ', '2026-09-11T11:19:00+00'::timestamptz, 70000.00, 67969.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 20 Cases', 20),
  ('ORD-WS6Z-JMEQ-RPH9', '2026-09-08T13:34:00+00'::timestamptz, 35000.00, 33984.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 10 Cases', 10),
  ('ORD-6RNS-J28P-1EJ9', '2026-09-08T13:34:00+00'::timestamptz, 70000.00, 67969.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 20 Cases', 20),
  ('ORD-94MP-31GR-CHHE', '2026-09-08T13:33:00+00'::timestamptz, 70000.00, 67969.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 20 Cases', 20),
  ('ORD-CBG9-D0H4-XPZS', '2026-08-21T12:47:00+00'::timestamptz, 35000.00, 33984.03, 0.00, 'succeeded', 'Jan Duke', 'cowenlaw.com', 'Case Bridge MVA Signed Retainer - 10 Cases', 10),
  ('ORD-BWGQ-Z6XT-TAQ5', '2026-08-20T11:54:00+00'::timestamptz, 35000.00, 33984.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 10 Cases', 10),
  ('ORD-S2F7-RCRA-RFB0', '2026-08-20T11:54:00+00'::timestamptz, 70000.00, 67969.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 20 Cases', 20),
  ('ORD-TD71-ZK61-3JJJ', '2026-08-20T11:53:00+00'::timestamptz, 70000.00, 67969.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 20 Cases', 20),
  ('ORD-CERW-AEWW-Q0ME', '2026-08-14T04:57:00+00'::timestamptz, 35000.00, 33984.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 10 Cases', 10),
  ('ORD-CGYQ-2MHH-028G', '2026-08-14T04:57:00+00'::timestamptz, 70000.00, 67969.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 20 Cases', 20),
  ('ORD-BXK9-YGGE-CKKB', '2026-07-24T09:36:00+00'::timestamptz, 3250.00, 3154.78, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 1 Case', 1),
  ('ORD-8SBR-HESE-86AV', '2026-07-23T06:12:00+00'::timestamptz, 35000.00, 33984.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 10 Cases', 10),
  ('ORD-FE4M-Q402-MJQE', '2026-07-23T06:11:00+00'::timestamptz, 70000.00, 67969.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 20 Cases', 20),
  ('ORD-KC76-RX6Y-MTBY', '2026-07-23T06:11:00+00'::timestamptz, 70000.00, 67969.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 20 Cases', 20),
  ('ORD-PKNN-VM56-16R3', '2026-07-22T15:27:00+00'::timestamptz, 33000.00, 32042.03, 0.00, 'succeeded', 'Guiny Urias', 'fears.com', 'Case Bridge MVA Signed Retainer - 10 Cases', 10),
  ('ORD-FAN5-9MZP-3V56', '2026-07-22T15:26:00+00'::timestamptz, 66000.00, 64085.03, 0.00, 'succeeded', 'Guiny Urias', 'fears.com', 'Case Bridge MVA Signed Retainer - 20 Cases', 20),
  ('ORD-06DH-7QDT-NA04', '2026-07-01T07:34:00+00'::timestamptz, 66000.00, 64085.03, 0.00, 'succeeded', 'Debbie Ames', 'fears.com', 'Case Bridge MVA Signed Retainer - 20 Cases', 20),
  ('ORD-YY87-PQH1-F5D5', '2026-06-19T07:39:00+00'::timestamptz, 52500.00, 50976.53, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 15 Cases', 15),
  ('ORD-P5FS-E7FF-WNXZ', '2026-06-19T07:38:00+00'::timestamptz, 52500.00, 50976.53, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 15 Cases', 15),
  ('ORD-M435-7V2R-2MEF', '2026-06-08T13:47:00+00'::timestamptz, 33000.00, 32042.03, 0.00, 'succeeded', 'Debbie Ames', 'fears.com', 'Case Bridge MVA Signed Retainer - 10 Cases', 10),
  ('ORD-WFZ7-P15Y-4NYF', '2026-06-02T04:59:00+00'::timestamptz, 32500.00, 31556.53, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 10 Cases', 10),
  ('ORD-TJMP-Q2SE-NDEF', '2026-05-26T18:11:00+00'::timestamptz, 52500.00, 50976.53, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 15 Cases', 15),
  ('ORD-9M2J-QV33-WXB5', '2026-05-26T18:10:00+00'::timestamptz, 52500.00, 50976.53, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 15 Cases', 15),
  ('ORD-V3PV-PVJ5-20NM', '2026-05-04T11:27:00+00'::timestamptz, 70000.00, 67969.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 20 Cases', 20),
  ('ORD-KD9Z-RGJB-RBKM', '2026-04-30T10:34:00+00'::timestamptz, 35000.00, 33984.03, 0.00, 'succeeded', 'Jason Eisenberg', 'gcelaw.com', 'Case Bridge MVA Signed Retainer - 10 Cases', 10),
  ('ORD-9HT3-HMM9-A3YH', '2026-04-21T14:14:00+00'::timestamptz, 35000.00, 33984.03, 0.00, 'succeeded', 'Jennifer Maldonado', 'jacobyandmeyers.com', 'Case Bridge MVA Signed Retainer - 10 Cases', 10),
  ('ORD-4WVA-X6GG-VGVG', '2026-03-13T12:59:00+00'::timestamptz, 20000.00, 19419.03, 0.00, 'succeeded', 'Brad Kittel', 'norbu.health', 'Case Bridge MVA Signed Retainer - 10 Cases', 10),
  ('ORD-6TPQ-4AAM-B4AJ', '2026-02-23T07:06:00+00'::timestamptz, 10000.00, 9709.03, 0.00, 'succeeded', 'Brad Kittel', 'mycrashattorneys.com', 'Case Bridge MVA Signed Retainer - 5 Cases', 5)
ON CONFLICT (payment_id) DO UPDATE SET
  gross    = EXCLUDED.gross,
  net      = EXCLUDED.net,
  refunded = EXCLUDED.refunded,
  status   = EXCLUDED.status;

-- Attach each payment to its firm where we have one.
SELECT link_payments_to_firms();
