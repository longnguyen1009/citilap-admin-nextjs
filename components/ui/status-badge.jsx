import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Ánh xạ nhãn trạng thái tiếng Việt / key sang variant shadcn
const STATUS_VARIANT_MAP = {
  // success
  done: "success",
  prepared: "success",
  active: "success",
  available: "success",
  in_stock: "success",
  shipped: "info",
  delivered: "info",
  cod: "purple",
  deposited: "warning",
  new: "warning",
  unpaid: "danger",
  cancelled: "neutral",
  returned: "neutral",
  inactive: "neutral",
  repairing: "warning",
  returned_cn: "neutral",
  skipped: "neutral",
  sold: "neutral",
};

export function StatusBadge({ label, variant, className, ...props }) {
  const resolved = variant || STATUS_VARIANT_MAP[String(label || "").toLowerCase().replace(/\s+/g, "_")] || "neutral";
  return (
    <Badge variant={resolved} className={cn("font-medium", className)} {...props}>
      {label}
    </Badge>
  );
}
