import { DollarSign } from "lucide-react";
import { useState } from "react";
import { FinanceStatsRow } from "@/components/accounting/FinanceStatsRow";
import { InvoiceAgingChart } from "@/components/accounting/InvoiceAgingChart";
import { InvoiceTable } from "@/components/accounting/InvoiceTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInvoices, useProfitLoss } from "@/hooks/useAccounting";

const statusOptions = ["all", "draft", "sent", "paid", "overdue"] as const;

export function AccountingPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = now.toISOString();

  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices(
    statusFilter !== "all" ? { status: statusFilter } : undefined,
  );
  const { data: profitLoss, isLoading: plLoading } = useProfitLoss(from, to);

  const invoices = invoicesData?.invoices ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "color-mix(in srgb, var(--accent-green) 15%, var(--bg-card))" }}
        >
          <DollarSign className="w-5 h-5 text-[var(--accent-green)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Accounting</h1>
          <p className="text-sm text-[var(--text-secondary)]">Financial management and reporting</p>
        </div>
      </div>

      {/* Stats */}
      <FinanceStatsRow
        invoices={invoices}
        profitLoss={profitLoss}
        isLoading={invoicesLoading || plLoading}
      />

      {/* Invoice Aging */}
      <Card className="border-[var(--border-mabos)] bg-[var(--bg-card)] shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-[var(--text-secondary)]">
            Invoice Aging
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceAgingChart invoices={invoices} />
        </CardContent>
      </Card>

      {/* Invoice Table */}
      <Card className="border-[var(--border-mabos)] bg-[var(--bg-card)] shadow-none">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-[var(--text-secondary)]">
              Invoices
            </CardTitle>
            <select
              className="text-xs px-2 py-1 rounded border border-[var(--border-mabos)] bg-[var(--bg-secondary)] text-[var(--text-primary)]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <InvoiceTable invoices={invoices} isLoading={invoicesLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
