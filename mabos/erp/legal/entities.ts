import type { BaseEntity } from "../shared/types.js";

export interface Contract extends BaseEntity {
  title: string;
  counterparty: string;
  type: string;
  value: number | null;
  currency: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  terms: string | null;
}

export interface LegalCase extends BaseEntity {
  title: string;
  caseType: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  description: string | null;
  filedDate: string | null;
}
