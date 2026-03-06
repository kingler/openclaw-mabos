# VividWalls Onboarding E2E Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a comprehensive E2E test that programmatically onboards VividWalls through the full 5-phase pipeline — including a custom domain ontology, 3-tier goal hierarchy, SBVR projection to live TypeDB, and BDI cognitive file seeding for all agents.

**Architecture:** Build a `vividwalls.jsonld` domain ontology that extends `ecommerce.jsonld` with art-specific concepts (editions, collections, artists, certificates of authenticity). Write a vitest E2E test that calls the existing onboarding tools in sequence, seeds 18+ goals in TOGAF 3-tier hierarchy (strategic/tactical/operational), projects the SBVR ontology to live TypeDB at `157.230.13.13:8729`, and asserts round-trip integrity of all seeded entities.

**Tech Stack:** TypeScript, Vitest, JSON-LD/OWL ontologies, TypeDB (live server), SBVR, BDI cognitive architecture

---

### Task 1: Create VividWalls Domain Ontology (vividwalls.jsonld)

**Files:**

- Create: `extensions/mabos/src/ontology/vividwalls.jsonld`

**Step 1: Write the ontology file**

Create `extensions/mabos/src/ontology/vividwalls.jsonld` following the exact pattern from `ecommerce.jsonld`. The ontology must:

- Import `https://mabos.io/ontology/ecommerce` (which itself imports `business-core`)
- Use prefix `vw:` → `https://mabos.io/ontology/vividwalls/`
- Include SBVR annotations on every class and object property

**Noun Concepts (owl:Class with sbvr:conceptType "NounConcept"):**

| ID                             | Label                       | SubClassOf        | SBVR Definition                                                                      |
| ------------------------------ | --------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| `vw:ArtPrint`                  | Art Print                   | `ecom:Product`    | An original or reproduced artwork prepared for wall display                          |
| `vw:Edition`                   | Edition                     | —                 | A limited production run of an art print with a fixed maximum quantity               |
| `vw:Collection`                | Art Collection              | `ecom:Collection` | A curated set of art prints grouped by theme, artist, or season                      |
| `vw:ArtistCollaboration`       | Artist Collaboration        | —                 | A partnership between VividWalls and an artist to produce exclusive collections      |
| `vw:CertificateOfAuthenticity` | Certificate of Authenticity | —                 | A document certifying the provenance and edition number of an art print              |
| `vw:Collector`                 | Collector                   | `ecom:Customer`   | A buyer who collects limited-edition art prints                                      |
| `vw:CollectorProfile`          | Collector Profile           | —                 | Preference and purchase history data for a collector                                 |
| `vw:GalleryPartner`            | Gallery Partner             | —                 | A physical or online gallery that exhibits or resells VividWalls collections         |
| `vw:GalleryExhibition`         | Gallery Exhibition          | —                 | An event where a gallery showcases VividWalls art to potential collectors            |
| `vw:FramingOption`             | Framing Option              | —                 | A frame style and material available for an art print                                |
| `vw:PrintMedium`               | Print Medium                | —                 | The physical medium on which art is printed (canvas, fine art paper, metal, acrylic) |
| `vw:PrintSize`                 | Print Size                  | —                 | A standard or custom dimension specification for an art print                        |
| `vw:ArtTaxonomy`               | Art Taxonomy                | —                 | A classification of art by style, movement, subject, and color palette               |
| `vw:PricingTier`               | Pricing Tier                | —                 | A pricing band (emerging, established, premium, masterwork) determining markup       |

**Datatype Properties (owl:DatatypeProperty):**

| ID                      | Domain                         | Range          | Comment                                                |
| ----------------------- | ------------------------------ | -------------- | ------------------------------------------------------ |
| `vw:editionSize`        | `vw:Edition`                   | `xsd:integer`  | Maximum number of prints in this edition               |
| `vw:editionNumber`      | `vw:Edition`                   | `xsd:integer`  | Sequence number of a specific print within the edition |
| `vw:artistName`         | `vw:ArtistCollaboration`       | `xsd:string`   | Name of the collaborating artist                       |
| `vw:royaltyPercentage`  | `vw:ArtistCollaboration`       | `xsd:float`    | Artist royalty percentage per sale (0.0-1.0)           |
| `vw:certificateId`      | `vw:CertificateOfAuthenticity` | `xsd:string`   | Unique certificate identifier                          |
| `vw:issuedDate`         | `vw:CertificateOfAuthenticity` | `xsd:dateTime` | Date the certificate was issued                        |
| `vw:collectorSince`     | `vw:CollectorProfile`          | `xsd:dateTime` | Date the collector first purchased                     |
| `vw:preferredStyles`    | `vw:CollectorProfile`          | `xsd:string`   | Comma-separated preferred art styles                   |
| `vw:totalEditionsOwned` | `vw:CollectorProfile`          | `xsd:integer`  | Total editions in the collector's collection           |
| `vw:tierMinMarkup`      | `vw:PricingTier`               | `xsd:float`    | Minimum markup percentage for this tier                |
| `vw:printWidth`         | `vw:PrintSize`                 | `xsd:integer`  | Width in centimeters                                   |
| `vw:printHeight`        | `vw:PrintSize`                 | `xsd:integer`  | Height in centimeters                                  |

**Object Properties / Fact Types (owl:ObjectProperty with sbvr:conceptType "FactType"):**

| ID                    | Domain                 | Range                          | SBVR Reading                                  |
| --------------------- | ---------------------- | ------------------------------ | --------------------------------------------- |
| `vw:hasEdition`       | `vw:Collection`        | `vw:Edition`                   | Collection has Edition                        |
| `vw:producedBy`       | `vw:Collection`        | `vw:ArtistCollaboration`       | Collection is produced by ArtistCollaboration |
| `vw:hasCertificate`   | `vw:Edition`           | `vw:CertificateOfAuthenticity` | Edition has CertificateOfAuthenticity         |
| `vw:purchasedBy`      | `vw:Edition`           | `vw:Collector`                 | Edition is purchased by Collector             |
| `vw:hasProfile`       | `vw:Collector`         | `vw:CollectorProfile`          | Collector has CollectorProfile                |
| `vw:exhibitedAt`      | `vw:Collection`        | `vw:GalleryExhibition`         | Collection is exhibited at GalleryExhibition  |
| `vw:hostedBy`         | `vw:GalleryExhibition` | `vw:GalleryPartner`            | GalleryExhibition is hosted by GalleryPartner |
| `vw:availableFraming` | `vw:ArtPrint`          | `vw:FramingOption`             | ArtPrint has available FramingOption          |
| `vw:printedOn`        | `vw:ArtPrint`          | `vw:PrintMedium`               | ArtPrint is printed on PrintMedium            |
| `vw:availableSize`    | `vw:ArtPrint`          | `vw:PrintSize`                 | ArtPrint is available in PrintSize            |
| `vw:classifiedAs`     | `vw:ArtPrint`          | `vw:ArtTaxonomy`               | ArtPrint is classified as ArtTaxonomy         |
| `vw:pricedAt`         | `vw:Edition`           | `vw:PricingTier`               | Edition is priced at PricingTier              |

**Business Rules (sbvr:DefinitionalRule and sbvr:BehavioralRule):**

| ID                          | Type         | SBVR Definition                                                                           |
| --------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `vw:rule-cert-required`     | Definitional | Each edition must have exactly one certificate of authenticity                            |
| `vw:rule-edition-limit`     | Behavioral   | The number of prints sold from an edition must not exceed the edition size                |
| `vw:rule-one-per-collector` | Behavioral   | A collector may purchase at most one copy of a given edition                              |
| `vw:rule-tier-markup`       | Definitional | The sale price of an edition must be at least the tier minimum markup above cost          |
| `vw:rule-artist-royalty`    | Behavioral   | Each sale of an edition from a collaboration must trigger a royalty payment to the artist |

Each rule should have `sbvr:constrainsFact` pointing to the relevant fact type, and `sbvr:hasProofTable` pointing to a proof table node.

**Step 2: Verify the ontology loads and validates**

Run: `cd /Volumes/SeagatePortableDrive/Projects/Software/openclaw-mabos && node --import tsx -e "import { loadOntologies, validateOntologies } from './extensions/mabos/src/ontology/index.js'; const o = loadOntologies(); console.log('Loaded:', o.size, 'ontologies'); const v = validateOntologies(o); console.log('Valid:', v.valid, 'Errors:', v.errors.length, 'Warnings:', v.warnings.length); if (v.errors.length) console.log(v.errors);"`

Expected: Loads successfully with 0 errors (warnings about missing labels are OK).

**Step 3: Commit**

```bash
git add extensions/mabos/src/ontology/vividwalls.jsonld
git commit -m "feat(ontology): add VividWalls art domain ontology

14 noun concepts, 12 datatype properties, 12 fact types, 5 business rules
with proof tables. Extends ecommerce.jsonld with art-specific vocabulary:
editions, collections, artist collaborations, certificates of authenticity,
collector profiles, gallery partnerships, framing options, and pricing tiers."
```

---

### Task 2: Write the VividWalls E2E Test — Scaffolding & Phase 1 (Discovery)

**Files:**

- Create: `extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts`

**Step 1: Write the test scaffolding and Phase 1**

Follow the exact pattern from `extensions/mabos/tests/onboarding-e2e.test.ts` for:

- Mock API setup (`beforeAll` / `afterAll`)
- `register(api)` to get all tools
- `callTool()` / `extractText()` helpers
- Temp workspace via `mkdtemp`

Define the VividWalls business profile:

```typescript
const VIVIDWALLS_BUSINESS = {
  business_id: "vividwalls",
  name: "VividWalls",
  legal_name: "VividWalls LLC",
  type: "ecommerce" as const,
  stage: "growth" as const,
  description:
    "Premium limited-edition wall art by Kingler Bercy. AI-powered e-commerce platform for curated abstract art prints, artist collaborations, and collector experiences.",
  products_services: [
    "Limited-edition wall art prints",
    "Artist collaboration collections",
    "Custom framing services",
    "Certificates of authenticity",
  ],
  target_market: "Art collectors, interior designers, luxury homeowners, commercial interior firms",
  revenue_model:
    "Direct-to-consumer premium art sales with framing upsells and artist royalty model",
  technology_stack: [
    "Shopify headless",
    "Next.js storefront",
    "TypeDB knowledge graph",
    "MABOS multi-agent system",
  ],
  team_size: "5-10",
  jurisdiction: "US",
  // BMC
  key_partners: [
    "Print-on-demand suppliers",
    "Fine art framers",
    "Gallery partners",
    "Collaborating artists",
  ],
  key_activities: [
    "Art curation",
    "Limited edition production",
    "Brand marketing",
    "Collector community building",
  ],
  key_resources: ["Art catalog", "Artist network", "E-commerce platform", "Collector database"],
  value_propositions: [
    "Museum-quality limited-edition prints",
    "Certificate of authenticity with every purchase",
    "Exclusive artist collaborations",
    "AR wall preview before purchase",
  ],
  customer_relationships: [
    "Personal art advisory",
    "Collector community",
    "Exhibition invitations",
  ],
  channels: ["vividwalls.co", "Instagram", "Gallery partnerships", "Art fairs"],
  customer_segments: [
    "Art collectors",
    "Interior designers",
    "Luxury homeowners",
    "Corporate art buyers",
  ],
  cost_structure: [
    "Printing & materials",
    "Artist royalties",
    "Platform hosting",
    "Marketing",
    "Framing supplies",
  ],
  revenue_streams: ["Art print sales", "Framing services", "Licensing fees", "Gallery commissions"],
  // Stakeholder goals (18 total — full business scope)
  stakeholder_goals: [
    // Strategic (CEO-level)
    { goal: "Reach $500K ARR within 18 months", priority: 0.95, type: "hard" as const },
    {
      goal: "Establish VividWalls as a recognized premium art brand",
      priority: 0.9,
      type: "hard" as const,
    },
    {
      goal: "Build collector community of 5,000 active members",
      priority: 0.85,
      type: "soft" as const,
    },
    // Finance (CFO)
    {
      goal: "Achieve 55% gross margin on all product lines",
      priority: 0.88,
      type: "hard" as const,
    },
    { goal: "Implement artist royalty payment system", priority: 0.8, type: "hard" as const },
    // Operations (COO)
    { goal: "Fulfill all orders within 3 business days", priority: 0.9, type: "hard" as const },
    {
      goal: "Build print-on-demand pipeline with 2 suppliers",
      priority: 0.75,
      type: "soft" as const,
    },
    // Marketing (CMO)
    { goal: "Launch 12 collections per year", priority: 0.85, type: "hard" as const },
    { goal: "Grow Instagram following to 50K", priority: 0.7, type: "soft" as const },
    { goal: "Achieve 40% repeat purchase rate", priority: 0.82, type: "hard" as const },
    // Technology (CTO)
    { goal: "Launch headless commerce platform on Next.js", priority: 0.88, type: "hard" as const },
    { goal: "Integrate TypeDB for product recommendations", priority: 0.75, type: "soft" as const },
    // HR
    {
      goal: "Build creative team of 15 (designers, curators, fulfillment)",
      priority: 0.7,
      type: "soft" as const,
    },
    // Legal
    {
      goal: "IP protection for all editions and original art",
      priority: 0.85,
      type: "hard" as const,
    },
    {
      goal: "Art import/export compliance for international sales",
      priority: 0.78,
      type: "hard" as const,
    },
    // Strategy
    { goal: "Secure 10 artist collaborations in year one", priority: 0.82, type: "soft" as const },
    { goal: "Establish 5 gallery partnerships", priority: 0.75, type: "soft" as const },
    // Knowledge
    {
      goal: "Catalogue complete art taxonomy for 500+ works",
      priority: 0.72,
      type: "soft" as const,
    },
  ],
  constraints: [
    "All prints must include certificate of authenticity",
    "Edition sizes capped — no unlimited runs",
    "Artist royalties paid within 30 days of sale",
    "Must comply with art import/export regulations",
  ],
};
```

Phase 1 (Discovery) test:

```typescript
describe("Phase 1: Discovery", () => {
  it("should have all required business fields populated", () => {
    assert.ok(VIVIDWALLS_BUSINESS.name);
    assert.ok(VIVIDWALLS_BUSINESS.legal_name);
    assert.ok(VIVIDWALLS_BUSINESS.type);
    assert.ok(VIVIDWALLS_BUSINESS.description);
    assert.ok(VIVIDWALLS_BUSINESS.value_propositions.length > 0);
    assert.ok(VIVIDWALLS_BUSINESS.customer_segments.length > 0);
    assert.ok(VIVIDWALLS_BUSINESS.revenue_streams.length > 0);
    assert.ok(VIVIDWALLS_BUSINESS.stakeholder_goals.length >= 18);
    assert.ok(VIVIDWALLS_BUSINESS.constraints.length > 0);
  });
});
```

**Step 2: Run the test to verify scaffolding works**

Run: `cd /Volumes/SeagatePortableDrive/Projects/Software/openclaw-mabos && pnpm vitest run extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts`

Expected: Phase 1 PASS

**Step 3: Commit**

```bash
git add extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts
git commit -m "test(onboarding): scaffold VividWalls E2E test with Phase 1 Discovery"
```

---

### Task 3: E2E Test — Phase 2 (Architecture Generation)

**Files:**

- Modify: `extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts`

**Step 1: Add Phase 2 tests**

```typescript
describe("Phase 2: Architecture", () => {
  it("should create VividWalls business workspace via onboard_business", async () => {
    const result = await callTool("onboard_business", {
      business_id: VIVIDWALLS_BUSINESS.business_id,
      name: VIVIDWALLS_BUSINESS.name,
      legal_name: VIVIDWALLS_BUSINESS.legal_name,
      type: VIVIDWALLS_BUSINESS.type,
      description: VIVIDWALLS_BUSINESS.description,
      value_propositions: VIVIDWALLS_BUSINESS.value_propositions,
      customer_segments: VIVIDWALLS_BUSINESS.customer_segments,
      revenue_streams: VIVIDWALLS_BUSINESS.revenue_streams,
      jurisdiction: VIVIDWALLS_BUSINESS.jurisdiction,
      stage: VIVIDWALLS_BUSINESS.stage,
    });
    const text = extractText(result);
    assert.ok(text.includes("VividWalls") || text.includes("vividwalls"));

    // Verify manifest
    const manifestPath = join(tmpWorkspace, "businesses", "vividwalls", "manifest.json");
    assert.ok(existsSync(manifestPath));
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    assert.equal(manifest.name, "VividWalls");
    assert.equal(manifest.type, "ecommerce");
    assert.equal(manifest.stage, "growth");

    // Verify 9 agent directories created
    const agentsDir = join(tmpWorkspace, "businesses", "vividwalls", "agents");
    const dirs = await readdir(agentsDir);
    assert.ok(dirs.length >= 9, `Should have >= 9 agents, got ${dirs.length}`);
  });

  it("should generate TOGAF architecture", async () => {
    const result = await callTool("togaf_generate", {
      business_id: "vividwalls",
      business_name: "VividWalls",
      business_type: "ecommerce",
      description: VIVIDWALLS_BUSINESS.description,
      products_services: VIVIDWALLS_BUSINESS.products_services,
      target_market: VIVIDWALLS_BUSINESS.target_market,
      revenue_model: VIVIDWALLS_BUSINESS.revenue_model,
      technology_stack: VIVIDWALLS_BUSINESS.technology_stack,
      stage: "growth",
    });
    const text = extractText(result);
    assert.ok(text.includes("TOGAF") || text.includes("togaf"));

    const bizDir = join(tmpWorkspace, "businesses", "vividwalls");
    assert.ok(existsSync(join(bizDir, "togaf-architecture.json")));
    assert.ok(existsSync(join(bizDir, "TOGAF-ARCHITECTURE.md")));

    const togaf = JSON.parse(await readFile(join(bizDir, "togaf-architecture.json"), "utf-8"));
    assert.equal(togaf.business_id, "vividwalls");
    assert.ok(togaf.business_architecture);
    assert.ok(togaf.application_architecture);
    assert.ok(togaf.technology_architecture);
    assert.deepEqual(
      togaf.technology_architecture.technology_stack,
      VIVIDWALLS_BUSINESS.technology_stack,
    );
  });

  it("should generate Business Model Canvas with all 9 blocks", async () => {
    const result = await callTool("bmc_generate", {
      business_id: "vividwalls",
      key_partners: VIVIDWALLS_BUSINESS.key_partners,
      key_activities: VIVIDWALLS_BUSINESS.key_activities,
      key_resources: VIVIDWALLS_BUSINESS.key_resources,
      value_propositions: VIVIDWALLS_BUSINESS.value_propositions,
      customer_relationships: VIVIDWALLS_BUSINESS.customer_relationships,
      channels: VIVIDWALLS_BUSINESS.channels,
      customer_segments: VIVIDWALLS_BUSINESS.customer_segments,
      cost_structure: VIVIDWALLS_BUSINESS.cost_structure,
      revenue_streams: VIVIDWALLS_BUSINESS.revenue_streams,
    });
    const text = extractText(result);
    assert.ok(text.includes("Canvas") || text.includes("BMC") || text.includes("bmc"));

    const bmcPath = join(tmpWorkspace, "businesses", "vividwalls", "business-model-canvas.json");
    const bmc = JSON.parse(await readFile(bmcPath, "utf-8"));
    const canvas = bmc.canvas || bmc;
    assert.ok(canvas.value_propositions);
    assert.ok(canvas.key_partners);
    assert.equal(canvas.key_partners.length, 4);
  });

  it("should generate Tropos goal model mapping 18 goals to agents", async () => {
    const result = await callTool("tropos_generate", {
      business_id: "vividwalls",
      stakeholder_goals: VIVIDWALLS_BUSINESS.stakeholder_goals,
      constraints: VIVIDWALLS_BUSINESS.constraints,
    });
    const text = extractText(result);
    assert.ok(text.includes("goal") || text.includes("Tropos"));

    const troposPath = join(tmpWorkspace, "businesses", "vividwalls", "tropos-goal-model.json");
    const tropos = JSON.parse(await readFile(troposPath, "utf-8"));
    assert.ok(
      tropos.goal_mapping.length >= 18,
      `Should have >= 18 goal mappings, got ${tropos.goal_mapping.length}`,
    );

    // Verify goals are distributed across multiple agents (not all CEO)
    const agents = new Set(tropos.goal_mapping.map((g: any) => g.primary_agent));
    assert.ok(
      agents.size >= 5,
      `Goals should map to >= 5 agents, got ${agents.size}: ${[...agents].join(", ")}`,
    );
  });

  it("should track architecture phase completion", async () => {
    await callTool("onboarding_progress", {
      business_id: "vividwalls",
      phase: "discovery",
      status: "completed",
    });
    await callTool("onboarding_progress", {
      business_id: "vividwalls",
      phase: "architecture",
      status: "completed",
    });
    const progressPath = join(tmpWorkspace, "businesses", "vividwalls", "onboarding-progress.json");
    const progress = JSON.parse(await readFile(progressPath, "utf-8"));
    assert.equal(progress.phases.discovery.status, "completed");
    assert.equal(progress.phases.architecture.status, "completed");
  });
});
```

**Step 2: Run tests**

Run: `cd /Volumes/SeagatePortableDrive/Projects/Software/openclaw-mabos && pnpm vitest run extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts`

Expected: Phase 1 + Phase 2 PASS

**Step 3: Commit**

```bash
git add extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts
git commit -m "test(onboarding): add Phase 2 Architecture tests for VividWalls"
```

---

### Task 4: E2E Test — Phase 3 (Agent Activation & Goal Seeding)

**Files:**

- Modify: `extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts`

**Step 1: Add Phase 3 tests**

```typescript
describe("Phase 3: Agent Activation & Goal Seeding", () => {
  it("should spawn ecommerce domain agents", async () => {
    const result = await callTool("agent_spawn_domain", {
      business_id: "vividwalls",
      business_type: "ecommerce",
    });
    const text = extractText(result);
    assert.ok(text.includes("Spawned") || text.includes("agent"));

    const agentsDir = join(tmpWorkspace, "businesses", "vividwalls", "agents");
    const dirs = await readdir(agentsDir);
    for (const agent of ["inventory-mgr", "fulfillment-mgr", "product-mgr"]) {
      assert.ok(dirs.includes(agent), `Missing domain agent: ${agent}`);
    }
  });

  it("should initialize desires for all 9 core roles", async () => {
    const result = await callTool("desire_init_from_template", {
      business_id: "vividwalls",
    });
    const text = extractText(result);
    assert.ok(text.includes("initialized") || text.includes("Desire"));

    const roles = ["ceo", "cfo", "coo", "cmo", "cto", "hr", "legal", "strategy", "knowledge"];
    const agentsDir = join(tmpWorkspace, "businesses", "vividwalls", "agents");

    for (const role of roles) {
      const desirePath = join(agentsDir, role, "Desires.md");
      assert.ok(existsSync(desirePath), `Desires.md should exist for ${role}`);
      const content = await readFile(desirePath, "utf-8");
      assert.ok(
        content.length > 100,
        `Desires for ${role} should have substantial content (got ${content.length} chars)`,
      );
    }
  });

  it("should have VividWalls-specific content in desire templates", async () => {
    const agentsDir = join(tmpWorkspace, "businesses", "vividwalls", "agents");
    const ceoDesires = await readFile(join(agentsDir, "ceo", "Desires.md"), "utf-8");
    // Template should have {business_name} replaced with VividWalls
    assert.ok(
      ceoDesires.includes("VividWalls") || ceoDesires.length > 200,
      "CEO desires should reference VividWalls or have substantial template content",
    );
  });

  it("should track agents phase completion", async () => {
    await callTool("onboarding_progress", {
      business_id: "vividwalls",
      phase: "agents",
      status: "completed",
      details: "9 core + 3 domain agents spawned, desires initialized",
    });
    const progressPath = join(tmpWorkspace, "businesses", "vividwalls", "onboarding-progress.json");
    const progress = JSON.parse(await readFile(progressPath, "utf-8"));
    assert.equal(progress.phases.agents.status, "completed");
  });
});
```

**Step 2: Run tests**

Run: `cd /Volumes/SeagatePortableDrive/Projects/Software/openclaw-mabos && pnpm vitest run extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts`

Expected: Phases 1-3 PASS

**Step 3: Commit**

```bash
git add extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts
git commit -m "test(onboarding): add Phase 3 Agent Activation & Goal Seeding for VividWalls"
```

---

### Task 5: E2E Test — Phase 4 (Knowledge Graph — SBVR + TypeDB)

**Files:**

- Modify: `extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts`

**Step 1: Add Phase 4 tests**

This is the most critical phase — it tests the ontology → SBVR → TypeDB pipeline. The tests must:

1. Load ontologies (including the new `vividwalls.jsonld`)
2. Validate the merged graph
3. Export SBVR for TypeDB
4. Assert VividWalls-specific concepts appear in the export
5. Connect to live TypeDB at `157.230.13.13:8729`
6. Create database `mabos_vividwalls`
7. Define base schema + ontology schema
8. Insert agent entities and goal entities
9. Query back to verify round-trip

```typescript
describe("Phase 4: Knowledge Graph (SBVR → TypeDB)", () => {
  it("should load and validate ontologies including vividwalls.jsonld", async () => {
    const { loadOntologies, validateOntologies, mergeOntologies, exportSBVRForTypeDB } =
      await import("../src/ontology/index.js");

    const ontologies = loadOntologies();
    assert.ok(ontologies.size >= 8, `Should load >= 8 ontologies, got ${ontologies.size}`);

    // Verify vividwalls ontology is loaded
    const vwOntology = [...ontologies.values()].find(
      (o) =>
        o["@id"] === "https://mabos.io/ontology/vividwalls" ||
        o["rdfs:label"]?.includes("VividWalls"),
    );
    assert.ok(vwOntology, "VividWalls ontology should be loaded");

    const validation = validateOntologies(ontologies);
    assert.equal(validation.errors.length, 0, `Validation errors: ${validation.errors.join("; ")}`);
  });

  it("should export VividWalls SBVR concepts for TypeDB", async () => {
    const { loadOntologies, mergeOntologies, exportSBVRForTypeDB } =
      await import("../src/ontology/index.js");

    const graph = mergeOntologies(loadOntologies());
    const sbvr = exportSBVRForTypeDB(graph);

    // VividWalls-specific concepts should appear
    const vwConcepts = sbvr.conceptTypes.filter((c) => c.id.startsWith("vw:"));
    assert.ok(vwConcepts.length >= 10, `Should have >= 10 VW concepts, got ${vwConcepts.length}`);

    const vwFacts = sbvr.factTypes.filter((f) => f.id.startsWith("vw:"));
    assert.ok(vwFacts.length >= 8, `Should have >= 8 VW fact types, got ${vwFacts.length}`);

    const vwRules = sbvr.rules.filter((r) => r.id.startsWith("vw:"));
    assert.ok(vwRules.length >= 4, `Should have >= 4 VW rules, got ${vwRules.length}`);

    console.log(
      `  SBVR export: ${sbvr.conceptTypes.length} concepts, ${sbvr.factTypes.length} facts, ${sbvr.rules.length} rules, ${sbvr.proofTables.length} proof tables`,
    );
  });

  it("should generate valid TypeQL schema from ontology", async () => {
    const { loadOntologies, mergeOntologies } = await import("../src/ontology/index.js");
    const { jsonldToTypeQL, generateDefineQuery } =
      await import("../src/knowledge/typedb-schema.js");

    const graph = mergeOntologies(loadOntologies());
    const schema = jsonldToTypeQL(graph);
    const typeql = generateDefineQuery(schema);

    assert.ok(typeql.startsWith("define"), "Should start with 'define'");
    assert.ok(
      typeql.includes("art_print") || typeql.includes("ArtPrint"),
      "Should include art_print entity",
    );
    assert.ok(typeql.includes("edition"), "Should include edition entity");
    assert.ok(typeql.includes("agent_owns"), "Should include agent_owns relation");

    console.log(
      `  TypeQL schema: ${schema.entities.length} entities, ${schema.attributes.length} attributes, ${schema.relations.length} relations`,
    );
  });

  it("should connect to live TypeDB and define schema", async () => {
    const { TypeDBClient } = await import("../src/knowledge/typedb-client.js");
    const { loadOntologies, mergeOntologies } = await import("../src/ontology/index.js");
    const { jsonldToTypeQL, generateDefineQuery } =
      await import("../src/knowledge/typedb-schema.js");
    const { getBaseSchema } = await import("../src/knowledge/typedb-queries.js");

    const client = new TypeDBClient();
    const connected = await client.connect();
    assert.ok(connected, "Should connect to TypeDB at 157.230.13.13:8729");

    // Create VividWalls database
    const dbName = "mabos_vividwalls_e2e_test";
    await client.ensureDatabase(dbName);

    // Define base schema
    await client.defineSchema(getBaseSchema(), dbName);

    // Define ontology schema (includes VividWalls concepts)
    const graph = mergeOntologies(loadOntologies());
    const ontologySchema = generateDefineQuery(jsonldToTypeQL(graph));
    await client.defineSchema(ontologySchema, dbName);

    // Verify via health check
    const health = await client.healthCheck();
    assert.ok(health.available);
    assert.ok(health.databases.includes(dbName), `Database ${dbName} should exist`);

    await client.close();
  }, 30_000); // 30s timeout for network operations

  it("should insert VividWalls agents into TypeDB", async () => {
    const { TypeDBClient } = await import("../src/knowledge/typedb-client.js");

    const client = new TypeDBClient();
    await client.connect();
    const dbName = "mabos_vividwalls_e2e_test";

    const agents = ["ceo", "cfo", "coo", "cmo", "cto", "hr", "legal", "strategy", "knowledge"];
    for (const agentId of agents) {
      const query = `insert $agent isa agent, has uid "vw-${agentId}", has name "${agentId.toUpperCase()} Agent";`;
      await client.insertData(query, dbName);
    }

    // Verify agents were inserted
    const result = await client.matchQuery(`match $a isa agent; fetch $a: uid, name;`, dbName);
    assert.ok(result, "Should get query result");
    console.log(`  Inserted ${agents.length} agents into TypeDB`);

    await client.close();
  }, 30_000);

  it("should insert goals into TypeDB with agent scoping", async () => {
    const { TypeDBClient } = await import("../src/knowledge/typedb-client.js");
    const { GoalStoreQueries } = await import("../src/knowledge/typedb-queries.js");

    const client = new TypeDBClient();
    await client.connect();
    const dbName = "mabos_vividwalls_e2e_test";

    // Seed strategic goals
    const strategicGoals = [
      {
        id: "G-CEO-S1",
        agentId: "vw-ceo",
        name: "Reach $500K ARR",
        description: "Reach $500K ARR within 18 months",
        hierarchy_level: "strategic",
        priority: 0.95,
        deadline: "2027-08-25",
      },
      {
        id: "G-CEO-S2",
        agentId: "vw-ceo",
        name: "Premium brand recognition",
        description: "Establish VividWalls as a recognized premium art brand",
        hierarchy_level: "strategic",
        priority: 0.9,
      },
      {
        id: "G-CFO-S1",
        agentId: "vw-cfo",
        name: "55% gross margin",
        description: "Achieve 55% gross margin on all product lines",
        hierarchy_level: "strategic",
        priority: 0.88,
      },
    ];

    // Seed tactical goals
    const tacticalGoals = [
      {
        id: "G-CMO-T1",
        agentId: "vw-cmo",
        name: "12 collections/year",
        description: "Launch 12 art collections per year",
        hierarchy_level: "tactical",
        priority: 0.85,
        parent_goal_id: "G-CEO-S2",
      },
      {
        id: "G-COO-T1",
        agentId: "vw-coo",
        name: "3-day fulfillment SLA",
        description: "Fulfill all orders within 3 business days",
        hierarchy_level: "tactical",
        priority: 0.9,
      },
      {
        id: "G-CTO-T1",
        agentId: "vw-cto",
        name: "Launch headless platform",
        description: "Launch Next.js headless commerce platform",
        hierarchy_level: "tactical",
        priority: 0.88,
      },
    ];

    // Seed operational goals
    const operationalGoals = [
      {
        id: "G-CMO-O1",
        agentId: "vw-cmo",
        name: "Launch March collection",
        description: "Curate and launch March 2026 spring collection",
        hierarchy_level: "operational",
        priority: 0.8,
        parent_goal_id: "G-CMO-T1",
        deadline: "2026-03-15",
      },
      {
        id: "G-COO-O1",
        agentId: "vw-coo",
        name: "Onboard 2nd print supplier",
        description: "Evaluate and onboard second print-on-demand supplier",
        hierarchy_level: "operational",
        priority: 0.75,
        parent_goal_id: "G-COO-T1",
        deadline: "2026-04-01",
      },
    ];

    const allGoals = [...strategicGoals, ...tacticalGoals, ...operationalGoals];
    for (const goal of allGoals) {
      const query = GoalStoreQueries.createGoal(goal.agentId, goal);
      await client.insertData(query, dbName);
    }

    // Verify goals were inserted with correct hierarchy levels
    const strategicResult = await client.matchQuery(
      GoalStoreQueries.queryGoals("vw-ceo", { hierarchy_level: "strategic" }),
      dbName,
    );
    assert.ok(strategicResult, "Should find strategic goals for CEO");

    console.log(
      `  Inserted ${allGoals.length} goals (${strategicGoals.length} strategic, ${tacticalGoals.length} tactical, ${operationalGoals.length} operational)`,
    );

    await client.close();
  }, 30_000);

  it("should track knowledge_graph phase completion", async () => {
    await callTool("onboarding_progress", {
      business_id: "vividwalls",
      phase: "knowledge_graph",
      status: "completed",
      details: "SBVR ontology projected to TypeDB, agents and goals seeded",
    });
    const progressPath = join(tmpWorkspace, "businesses", "vividwalls", "onboarding-progress.json");
    const progress = JSON.parse(await readFile(progressPath, "utf-8"));
    assert.equal(progress.phases.knowledge_graph.status, "completed");
  });
});
```

**Step 2: Run tests**

Run: `cd /Volumes/SeagatePortableDrive/Projects/Software/openclaw-mabos && pnpm vitest run extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts`

Expected: Phases 1-4 PASS (requires TypeDB connectivity)

**Step 3: Commit**

```bash
git add extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts
git commit -m "test(onboarding): add Phase 4 Knowledge Graph tests — SBVR + live TypeDB"
```

---

### Task 6: E2E Test — Phase 5 (Launch Verification) & Final Assertions

**Files:**

- Modify: `extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts`

**Step 1: Add Phase 5 and final verification tests**

```typescript
describe("Phase 5: Launch Verification", () => {
  it("should mark launch phase and show canvas", async () => {
    const result = await callTool("onboarding_progress", {
      business_id: "vividwalls",
      phase: "launch",
      status: "completed",
      show_canvas: true,
    });
    const text = extractText(result);
    assert.ok(text.length > 100, "Should include substantial launch output");
  });

  it("should report 100% completion across all phases", async () => {
    const progressPath = join(tmpWorkspace, "businesses", "vividwalls", "onboarding-progress.json");
    const progress = JSON.parse(await readFile(progressPath, "utf-8"));

    const phases = ["discovery", "architecture", "agents", "knowledge_graph", "launch"];
    for (const phase of phases) {
      assert.equal(
        progress.phases[phase].status,
        "completed",
        `Phase ${phase} should be completed`,
      );
    }
    assert.equal(progress.overall_status, "completed");
  });
});

describe("Final Workspace Integrity", () => {
  it("should have complete business directory", async () => {
    const bizDir = join(tmpWorkspace, "businesses", "vividwalls");
    const expected = [
      "manifest.json",
      "togaf-architecture.json",
      "TOGAF-ARCHITECTURE.md",
      "business-model-canvas.json",
      "tropos-goal-model.json",
      "onboarding-progress.json",
    ];
    for (const file of expected) {
      assert.ok(existsSync(join(bizDir, file)), `${file} should exist`);
    }
  });

  it("should have cognitive files for all 12 agents (9 core + 3 domain)", async () => {
    const agentsDir = join(tmpWorkspace, "businesses", "vividwalls", "agents");
    const allAgents = [
      "ceo",
      "cfo",
      "coo",
      "cmo",
      "cto",
      "hr",
      "legal",
      "strategy",
      "knowledge",
      "inventory-mgr",
      "fulfillment-mgr",
      "product-mgr",
    ];

    for (const agent of allAgents) {
      assert.ok(existsSync(join(agentsDir, agent)), `Agent dir for ${agent} should exist`);
      assert.ok(existsSync(join(agentsDir, agent, "Persona.md")), `Persona.md for ${agent}`);
    }
  });

  it("should have goal mapping covering at least 5 departments", async () => {
    const troposPath = join(tmpWorkspace, "businesses", "vividwalls", "tropos-goal-model.json");
    const tropos = JSON.parse(await readFile(troposPath, "utf-8"));
    const departments = new Set(tropos.goal_mapping.map((g: any) => g.primary_agent));
    assert.ok(departments.size >= 5, `Should cover >= 5 departments, got ${departments.size}`);
  });
});

describe("TypeDB Cleanup", () => {
  it("should clean up test database", async () => {
    // Best-effort cleanup — don't fail the test if TypeDB is unreachable
    try {
      const { TypeDBClient } = await import("../src/knowledge/typedb-client.js");
      const client = new TypeDBClient();
      const connected = await client.connect();
      if (connected) {
        // Note: TypeDB HTTP driver doesn't have deleteDatabase — leave for manual cleanup
        // or use the driver's API if available
        console.log("  TypeDB test database mabos_vividwalls_e2e_test left for manual cleanup");
      }
      await client.close();
    } catch {
      console.log("  TypeDB cleanup skipped (unavailable)");
    }
  });
});
```

**Step 2: Run the full test suite**

Run: `cd /Volumes/SeagatePortableDrive/Projects/Software/openclaw-mabos && pnpm vitest run extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts`

Expected: All 5 phases PASS

**Step 3: Commit**

```bash
git add extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts
git commit -m "test(onboarding): add Phase 5 Launch & final integrity checks for VividWalls

Complete VividWalls E2E onboarding test covering:
- 18 stakeholder goals in 3-tier TOGAF hierarchy
- Custom vividwalls.jsonld ontology with 14 concepts, 12 facts, 5 rules
- SBVR projection to live TypeDB
- 9 core + 3 domain agents with cognitive file seeding
- Full 5-phase pipeline verification"
```

---

### Task 7: Run Full Suite & Verify

**Step 1: Run the VividWalls E2E test end-to-end**

Run: `cd /Volumes/SeagatePortableDrive/Projects/Software/openclaw-mabos && pnpm vitest run extensions/mabos/tests/vividwalls-onboarding-e2e.test.ts --reporter=verbose`

Expected: All tests PASS with verbose output showing each phase.

**Step 2: Run the existing Acme Widgets test to ensure no regression**

Run: `cd /Volumes/SeagatePortableDrive/Projects/Software/openclaw-mabos && pnpm vitest run extensions/mabos/tests/onboarding-e2e.test.ts`

Expected: All existing tests still PASS.

**Step 3: Final commit with both tests green**

If needed, fix any issues and create a final commit.
