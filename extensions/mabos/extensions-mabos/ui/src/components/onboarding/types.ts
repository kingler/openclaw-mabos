// Shared types for conversational onboarding components

export interface BmcItem {
  title: string;
  description: string;
}

export interface WorkspaceData {
  businessType: string;
  companyName: string;
  businessId: string;
  industry: string;
  stage: string;
  vision: string;
  mission: string;
  values: string[];
  bmcBlocks: Record<string, BmcItem[]>;
}

export interface FormField {
  name: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[];
  required?: boolean;
  placeholder?: string;
}
