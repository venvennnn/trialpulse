import type { Payout } from "@/domain/types";
import { VOLUNTEER_POLICY_V1 } from "@/domain/policy";
import { CHECKIN, GENERIC_FARE, RIVERSIDE, SUPPLIES, SUPPLIES_PRIOR } from "./geometry";
import type { DemoClaim, DemoLine, DemoReceipt, DemoState } from "./types";

export const DEMO_WORKSPACE_ID = "ws_harborlight";
export const DEMO_CLOCK = "2025-01-18T20:05:00.000Z";
export const MAYA_ID = "usr_maya";
export const ALEX_ID = "usr_alex";
export const HERO_CLAIM_ID = "TP-1042";
export const PRIOR_CLAIM_ID = "TP-1037";
export const POLICY_ID = VOLUNTEER_POLICY_V1.id;

const PROGRAM = { id: "prog_nutrition", name: "Community Nutrition" };

function line(partial: DemoLine): DemoLine {
  return partial;
}

function receipt(partial: DemoReceipt): DemoReceipt {
  return partial;
}

export function createSeedState(): DemoState {
  const train = receipt({
    id: "rcpt_1042_train",
    claimId: HERO_CLAIM_ID,
    fileName: "riverside-rail.svg",
    src: RIVERSIDE.src,
    width: RIVERSIDE.width,
    height: RIVERSIDE.height,
    contentHash: "hash_riverside_1042",
    perceptualHash: "0123456789abcdef",
    merchant: "Riverside Rail",
    reference: "RIV-18442",
    alt: "Riverside Rail train receipt for a one-way City Line fare totaling $24.00 on January 18, 2025.",
    regions: RIVERSIDE.regions,
    kind: "receipt",
    fields: [
      { name: "date", label: "Date", value: "Jan 18, 2025" },
      { name: "service", label: "Service", value: "City Line" },
      { name: "route", label: "Route", value: "Riverside – Central" },
      { name: "ticket", label: "Ticket", value: "One-Way" },
      { name: "fare", label: "Fare", value: "$24.00" },
      { name: "total", label: "Total", value: "$24.00" },
    ],
  });
  const supplies = receipt({
    id: "rcpt_1042_supplies",
    claimId: HERO_CLAIM_ID,
    fileName: "community-supplies.svg",
    src: SUPPLIES.src,
    width: SUPPLIES.width,
    height: SUPPLIES.height,
    contentHash: "hash_supplies_1042",
    perceptualHash: "aaaaaaaaaaaaaaab",
    merchant: "Community Supplies",
    reference: "4418",
    alt: "Community Supplies receipt for office and pantry supplies totaling $16.00 on January 18, 2025.",
    regions: SUPPLIES.regions,
    kind: "receipt",
    fields: [
      { name: "merchant", label: "Merchant", value: "Community Supplies" },
      { name: "descriptor", label: "Items", value: "Office & Pantry Supplies" },
      { name: "date", label: "Date", value: "Jan 18, 2025" },
      { name: "total", label: "Total", value: "$16.00" },
    ],
  });
  const checkin = receipt({
    id: "rcpt_1042_checkin",
    claimId: HERO_CLAIM_ID,
    fileName: "shift-checkin.svg",
    src: CHECKIN.src,
    width: CHECKIN.width,
    height: CHECKIN.height,
    contentHash: "hash_checkin_1042",
    perceptualHash: null,
    merchant: "Harborlight Volunteers",
    reference: "SHIFT-1042",
    alt: "Shift check-in for Maya Chen at the Community Pantry Shift on January 18, 2025.",
    regions: {},
    kind: "document",
    fields: [
      { name: "volunteer", label: "Volunteer", value: "Maya Chen" },
      { name: "activity", label: "Activity", value: "Community Pantry Shift" },
      { name: "date", label: "Date", value: "Jan 18, 2025" },
    ],
  });
  const prior = receipt({
    id: "rcpt_1037_supplies",
    claimId: PRIOR_CLAIM_ID,
    fileName: "community-supplies-tp1037.svg",
    src: SUPPLIES_PRIOR.src,
    width: SUPPLIES_PRIOR.width,
    height: SUPPLIES_PRIOR.height,
    contentHash: "hash_supplies_1037",
    perceptualHash: "aaaaaaaaaaaaaaaa",
    merchant: "Community Supplies",
    reference: "4402",
    alt: "Earlier Community Supplies receipt from claim TP-1037 totaling $16.00 on January 18, 2025.",
    regions: SUPPLIES_PRIOR.regions,
    kind: "receipt",
    fields: [
      { name: "merchant", label: "Merchant", value: "Community Supplies" },
      { name: "descriptor", label: "Items", value: "Office & Pantry Supplies" },
      { name: "date", label: "Date", value: "Jan 18, 2025" },
      { name: "total", label: "Total", value: "$16.00" },
    ],
  });

  const hero: DemoClaim = {
    id: HERO_CLAIM_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    claimantId: MAYA_ID,
    claimantName: "Maya Chen",
    activityId: "act_pantry",
    activityName: "Community Pantry Shift",
    activityDate: "2025-01-18",
    programId: PROGRAM.id,
    programName: PROGRAM.name,
    submittedAt: "2025-01-18T16:40:00.000Z",
    dueAt: "2025-01-18T08:00:00.000Z",
    lastActionAt: "2025-01-18T16:40:00.000Z",
    createdAt: "2025-01-18T16:12:00.000Z",
    revision: 2,
    policyVersionId: POLICY_ID,
    receiptOrder: [train.id, supplies.id, checkin.id],
    lines: [
      line({
        id: "ln_1042_fare",
        category: "transit",
        title: "Train fare",
        detail: "Transit to/from volunteer site",
        claimedAmount: 2400,
        approvedAmount: 0,
        currency: "USD",
        expenseDate: "2025-01-18",
        reviewState: "submitted",
        revision: 1,
        receiptId: train.id,
        highlightField: "total",
        policyVersionId: POLICY_ID,
        requiresOverrideReason: false,
        clarification: null,
        reply: null,
        flags: [
          {
            code: "eligible",
            severity: "info",
            message: "Transit for an assigned activity is inside the policy cap and date window.",
          },
        ],
      }),
      line({
        id: "ln_1042_supplies",
        category: "supplies",
        title: "Supplies",
        detail: "Pantry supplies (non-food)",
        claimedAmount: 1600,
        approvedAmount: 0,
        currency: "USD",
        expenseDate: "2025-01-18",
        reviewState: "submitted",
        revision: 1,
        receiptId: supplies.id,
        highlightField: "total",
        policyVersionId: POLICY_ID,
        requiresOverrideReason: true,
        clarification: null,
        reply: null,
        flags: [
          {
            code: "possible_duplicate",
            severity: "exception",
            message:
              "Matches a prior claim (TP-1037) for similar items at the same store on Jan 18, 2025 ($16.00). Please verify if this is a separate purchase.",
            candidateClaimId: PRIOR_CLAIM_ID,
            merchant: "Community Supplies",
            descriptor: "Office & Pantry Supplies",
            expenseDate: "2025-01-18",
            amount: 1600,
            receiptId: prior.id,
            reasons: ["Similar receipt image", "Same merchant", "Same amount", "Same date"],
          },
        ],
      }),
    ],
  };

  const priorClaim: DemoClaim = {
    id: PRIOR_CLAIM_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    claimantId: "usr_elena",
    claimantName: "Elena Brooks",
    activityId: "act_pantry",
    activityName: "Community Pantry Shift",
    activityDate: "2025-01-18",
    programId: PROGRAM.id,
    programName: PROGRAM.name,
    submittedAt: "2025-01-18T13:10:00.000Z",
    dueAt: "2025-01-20T13:10:00.000Z",
    lastActionAt: "2025-01-18T15:00:00.000Z",
    createdAt: "2025-01-18T13:00:00.000Z",
    revision: 4,
    policyVersionId: POLICY_ID,
    receiptOrder: [prior.id],
    lines: [
      line({
        id: "ln_1037_supplies",
        category: "supplies",
        title: "Supplies",
        detail: "Office & pantry supplies",
        claimedAmount: 1600,
        approvedAmount: 1600,
        currency: "USD",
        expenseDate: "2025-01-18",
        reviewState: "approved",
        revision: 3,
        receiptId: prior.id,
        highlightField: "total",
        policyVersionId: POLICY_ID,
        requiresOverrideReason: false,
        clarification: null,
        reply: null,
        flags: [],
      }),
    ],
  };

  const priorPayout: Payout = {
    id: "pay_1037",
    workspaceId: DEMO_WORKSPACE_ID,
    claimantId: "usr_elena",
    claimId: PRIOR_CLAIM_ID,
    destinationId: "dest_elena",
    destinationVersion: 1,
    recipientEmail: "elena.brooks.demo@sandbox.test",
    amount: 1600,
    currency: "USD",
    status: "succeeded",
    senderBatchId: "tpb_pay_1037",
    senderItemId: "tpi_pay_1037",
    providerBatchId: "SIMBATCH-pay_1037",
    providerItemId: "SIMITEM-pay_1037",
    providerRawStatus: "SUCCESS",
    idempotencyKey: "seed:pay_1037",
    payloadHash: "seed",
    createdAt: "2025-01-18T14:40:00.000Z",
    updatedAt: "2025-01-18T15:00:00.000Z",
    lastObservationAt: "2025-01-18T15:00:00.000Z",
    lineIds: ["ln_1037_supplies"],
    note: "Volunteer reimbursement",
    lastError: null,
    allocations: [
      {
        id: "alloc_pay_1037_0",
        payoutId: "pay_1037",
        lineId: "ln_1037_supplies",
        amount: 1600,
        currency: "USD",
        state: "settled",
      },
    ],
  };

  const others = otherClaims();
  const otherReceipts = others.flatMap((claim) => claim.receipts);

  return {
    version: 1,
    clock: DEMO_CLOCK,
    seedLoaded: true,
    role: "coordinator",
    simulation: "success",
    forceError: false,
    lastError: null,
    seq: 200,
    destination: {
      id: "dest_maya",
      workspaceId: DEMO_WORKSPACE_ID,
      claimantId: MAYA_ID,
      version: 1,
      email: "maya.chen.demo@sandbox.test",
      status: "verified",
    },
    activities: [
      { id: "act_pantry", name: "Community Pantry Shift", date: "2025-01-18", site: "Riverside neighborhood pantry" },
      { id: "act_food", name: "Food Drive Setup", date: "2025-01-17", site: "Harborlight warehouse" },
      {
        id: "act_sort",
        name: "Sorting & Packaging",
        date: "2025-01-16",
        site: "Harborlight warehouse",
      },
      {
        id: "act_long",
        name: "Community Pantry Shift — weekend cold-storage restock and neighborhood delivery route for shelf-stable goods",
        date: "2025-01-15",
        site: "Riverside neighborhood pantry",
      },
    ],
    claims: [hero, ...others.map((entry) => entry.claim), priorClaim],
    receipts: [train, supplies, checkin, prior, ...otherReceipts],
    payouts: [priorPayout],
    idempotency: [
      { key: priorPayout.idempotencyKey, actorId: ALEX_ID, payloadHash: priorPayout.payloadHash, payoutId: priorPayout.id },
    ],
    timeline: [
      {
        id: "tl_1042_submit",
        claimId: HERO_CLAIM_ID,
        at: "2025-01-18T16:40:00.000Z",
        label: "Claim submitted",
        detail: "Maya Chen submitted $40.00 across train fare and supplies.",
        tone: "neutral",
      },
      {
        id: "tl_1037_paid",
        claimId: PRIOR_CLAIM_ID,
        at: "2025-01-18T15:00:00.000Z",
        label: "Paid",
        detail: "Simulated provider confirmed $16.00 for TP-1037.",
        tone: "good",
      },
    ],
    judgements: [],
    ui: {
      activeClaimId: HERO_CLAIM_ID,
      focusedLineId: "ln_1042_fare",
      checkedLineIds: ["ln_1042_fare"],
      expandedLineIds: ["ln_1042_supplies"],
      draftClaimId: null,
      payoutAttempt: "attempt_1",
      lastPayoutId: null,
    },
  };
}

function otherClaims(): { claim: DemoClaim; receipts: DemoReceipt[] }[] {
  const specs: {
    id: string;
    name: string;
    claimantId: string;
    activityId: string;
    activityName: string;
    activityDate: string;
    amount: number;
    category: string;
    title: string;
    detail: string;
    submittedAt: string;
    reviewState: DemoLine["reviewState"];
    flag: DemoLine["flags"][number] | null;
    clarification?: string;
  }[] = [
    {
      id: "TP-1041",
      name: "Daniel Park",
      claimantId: "usr_daniel",
      activityId: "act_food",
      activityName: "Food Drive Setup",
      activityDate: "2025-01-17",
      amount: 1850,
      category: "transit",
      title: "Train fare",
      detail: "Transit to the warehouse",
      submittedAt: "2025-01-18T15:10:00.000Z",
      reviewState: "submitted",
      flag: { code: "eligible", severity: "info", message: "Transit for an assigned activity is inside the policy cap and date window." },
    },
    {
      id: "TP-1040",
      name: "Aisha Khan",
      claimantId: "usr_aisha",
      activityId: "act_pantry",
      activityName: "Community Pantry Shift",
      activityDate: "2025-01-18",
      amount: 2700,
      category: "supplies",
      title: "Supplies",
      detail: "Storage bins",
      submittedAt: "2025-01-18T14:05:00.000Z",
      reviewState: "submitted",
      flag: { code: "over_cap", severity: "exception", message: "Supplies cap is 25.00 USD." },
    },
    {
      id: "TP-1039",
      name: "Liam Ortiz",
      claimantId: "usr_liam",
      activityId: "act_sort",
      activityName: "Sorting & Packaging",
      activityDate: "2025-01-16",
      amount: 1200,
      category: "meals",
      title: "Meal",
      detail: "Volunteer meal after the shift",
      submittedAt: "2025-01-17T18:20:00.000Z",
      reviewState: "submitted",
      flag: { code: "eligible", severity: "info", message: "Meals for an assigned activity are inside the policy cap." },
    },
    {
      id: "TP-1038",
      name: "Priya Shah",
      claimantId: "usr_priya",
      activityId: "act_pantry",
      activityName: "Community Pantry Shift",
      activityDate: "2025-01-18",
      amount: 900,
      category: "transit",
      title: "Bus fare",
      detail: "Two rides, date unreadable on the photo",
      submittedAt: "2025-01-18T12:15:00.000Z",
      reviewState: "needs_clarification",
      clarification: "Please retake the receipt so the date is visible.",
      flag: { code: "unreadable_date", severity: "exception", message: "The receipt date could not be read." },
    },
    {
      id: "TP-1036",
      name: "Jonah Ellis",
      claimantId: "usr_jonah",
      activityId: "act_long",
      activityName:
        "Community Pantry Shift — weekend cold-storage restock and neighborhood delivery route for shelf-stable goods",
      activityDate: "2025-01-15",
      amount: 2200,
      category: "transit",
      title: "Train fare",
      detail: "Round trip for the delivery route",
      submittedAt: "2025-01-16T11:00:00.000Z",
      reviewState: "submitted",
      flag: { code: "date_window", severity: "exception", message: "Expense date is outside the 1-day activity window." },
    },
    {
      id: "TP-1035",
      name: "Nora Bennett",
      claimantId: "usr_nora",
      activityId: "act_food",
      activityName: "Food Drive Setup",
      activityDate: "2025-01-17",
      amount: 1500,
      category: "supplies",
      title: "Supplies",
      detail: "Labels and markers",
      submittedAt: "2025-01-17T21:12:00.000Z",
      reviewState: "submitted",
      flag: { code: "eligible", severity: "info", message: "Supplies for an assigned activity are inside the policy cap." },
    },
    {
      id: "TP-1034",
      name: "Samir Haddad",
      claimantId: "usr_samir",
      activityId: "act_sort",
      activityName: "Sorting & Packaging",
      activityDate: "2025-01-16",
      amount: 800,
      category: "transit",
      title: "Bus fare",
      detail: "Transit home from the warehouse",
      submittedAt: "2025-01-16T19:40:00.000Z",
      reviewState: "submitted",
      flag: { code: "eligible", severity: "info", message: "Transit for an assigned activity is inside the policy cap and date window." },
    },
    {
      id: "TP-1033",
      name: "Helen Cho",
      claimantId: "usr_helen",
      activityId: "act_pantry",
      activityName: "Community Pantry Shift",
      activityDate: "2025-01-18",
      amount: 640,
      category: "meals",
      title: "Meal",
      detail: "Sandwich during the shift",
      submittedAt: "2025-01-18T17:55:00.000Z",
      reviewState: "submitted",
      flag: { code: "missing_evidence", severity: "exception", message: "A receipt is required for meals." },
    },
    {
      id: "TP-1032",
      name: "Chris Nguyen",
      claimantId: "usr_chris",
      activityId: "act_food",
      activityName: "Food Drive Setup",
      activityDate: "2025-01-17",
      amount: 2100,
      category: "transit",
      title: "Train fare",
      detail: "Same-day fare, different passenger",
      submittedAt: "2025-01-17T16:05:00.000Z",
      reviewState: "submitted",
      flag: { code: "eligible", severity: "info", message: "Transit for an assigned activity is inside the policy cap and date window." },
    },
    {
      id: "TP-1031",
      name: "Rosa Alvarez",
      claimantId: "usr_rosa",
      activityId: "act_sort",
      activityName: "Sorting & Packaging",
      activityDate: "2025-01-16",
      amount: 500,
      category: "supplies",
      title: "Supplies",
      detail: "Tape",
      submittedAt: "2025-01-16T15:30:00.000Z",
      reviewState: "submitted",
      flag: { code: "currency_mismatch", severity: "exception", message: "This policy pays USD only." },
    },
    {
      id: "TP-1030",
      name: "Owen Blake",
      claimantId: "usr_owen",
      activityId: "act_food",
      activityName: "Food Drive Setup",
      activityDate: "2025-01-17",
      amount: 1400,
      category: "transit",
      title: "Train fare",
      detail: "Transit to setup",
      submittedAt: "2025-01-17T13:25:00.000Z",
      reviewState: "submitted",
      flag: { code: "eligible", severity: "info", message: "Transit for an assigned activity is inside the policy cap and date window." },
    },
  ];

  return specs.map((spec) => {
    const receiptId = `rcpt_${spec.id.toLowerCase()}`;
    const image = spec.category === "supplies" ? SUPPLIES : GENERIC_FARE;
    const doc = receipt({
      id: receiptId,
      claimId: spec.id,
      fileName: `${spec.id.toLowerCase()}.svg`,
      src: image.src,
      width: image.width,
      height: image.height,
      contentHash: `hash_${spec.id}`,
      perceptualHash: spec.category === "transit" ? "0000000000000000" : "bbbbbbbbbbbbbbbb",
      merchant: spec.category === "transit" ? "Riverside Rail" : "Community Supplies",
      reference: spec.id,
      alt: `${spec.title} receipt for ${spec.name}, ${spec.activityName}.`,
      regions: "regions" in image ? image.regions : {},
      kind: spec.flag?.code === "missing_evidence" ? "document" : "receipt",
      fields: [
        { name: "total", label: "Total", value: `$${(spec.amount / 100).toFixed(2)}` },
        { name: "date", label: "Date", value: spec.activityDate },
      ],
    });
    const claim: DemoClaim = {
      id: spec.id,
      workspaceId: DEMO_WORKSPACE_ID,
      claimantId: spec.claimantId,
      claimantName: spec.name,
      activityId: spec.activityId,
      activityName: spec.activityName,
      activityDate: spec.activityDate,
      programId: PROGRAM.id,
      programName: PROGRAM.name,
      submittedAt: spec.submittedAt,
      dueAt: new Date(Date.parse(spec.submittedAt) + 48 * 60 * 60 * 1000).toISOString(),
      lastActionAt: spec.submittedAt,
      createdAt: spec.submittedAt,
      revision: 1,
      policyVersionId: POLICY_ID,
      receiptOrder: [doc.id],
      lines: [
        line({
          id: `ln_${spec.id.toLowerCase()}_1`,
          category: spec.category,
          title: spec.title,
          detail: spec.detail,
          claimedAmount: spec.amount,
          approvedAmount: 0,
          currency: "USD",
          expenseDate: spec.flag?.code === "unreadable_date" ? null : spec.activityDate,
          reviewState: spec.reviewState,
          revision: 1,
          receiptId: spec.flag?.code === "missing_evidence" ? null : doc.id,
          highlightField: "total",
          policyVersionId: POLICY_ID,
          requiresOverrideReason: spec.flag?.severity === "exception",
          clarification: spec.clarification ?? null,
          reply: null,
          flags: spec.flag ? [spec.flag] : [],
        }),
      ],
    };
    return { claim, receipts: [doc] };
  });
}
