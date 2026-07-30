import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  FolderTree,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  GripVertical,
  X,
  FileSpreadsheet,
  BarChart3,
  Settings,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  testSheetConnection,
  type Category,
  type SheetConfig,
} from "@/lib/api";

// ── Validation schemas ────────────────────────────────────────────────────────

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  status: z.enum(["active", "inactive"]),
  submitEnabled: z.boolean(),
  pricePerGoodId: z.coerce.number().min(0, "Must be 0 or greater"),
  displayOrder: z.coerce.number().min(0, "Must be 0 or greater"),

  // Daily limit
  dailyLimitEnabled: z.boolean(),
  dailySubmitCount: z.coerce.number().min(0, "Must be 0 or greater"),

  // Time window
  submitStartTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
  submitEndTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),

  // Flags
  countdownSupport: z.boolean(),
  duplicateCheck: z.boolean(),
  recheckEnabled: z.boolean(),

  // ID range
  minIds: z.coerce.number().min(0, "Must be 0 or greater"),
  maxIds: z.coerce.number().min(0, "Must be 0 or greater"),
});

// Edit schema adds UI-only fields not sent to the API
const categoryEditSchema = categorySchema.extend({
  categoryIcon: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;
type CategoryEditFormValues = z.infer<typeof categoryEditSchema>;

const defaultValues: CategoryFormValues = {
  name: "",
  description: "",
  status: "active",
  submitEnabled: false,
  pricePerGoodId: 0,
  displayOrder: 0,
  dailyLimitEnabled: false,
  dailySubmitCount: 0,
  submitStartTime: "00:00",
  submitEndTime: "23:59",
  countdownSupport: false,
  duplicateCheck: true,
  recheckEnabled: false,
  minIds: 1,
  maxIds: 100,
};

// ── Default sheet columns ─────────────────────────────────────────────────────

const DEFAULT_SHEET_COLUMNS = ["UID", "Password", "2FA", "Cookies", "Full Mail"];

// ── Shared form (used by Create dialog — unchanged) ───────────────────────────

function CategoryForm({
  formId,
  initialValues,
  onSubmit,
}: {
  formId: string;
  initialValues: CategoryFormValues;
  onSubmit: (data: CategoryFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: initialValues,
  });

  const status = watch("status");
  const submitEnabled = watch("submitEnabled");
  const dailyLimitEnabled = watch("dailyLimitEnabled");
  const countdownSupport = watch("countdownSupport");
  const duplicateCheck = watch("duplicateCheck");
  const recheckEnabled = watch("recheckEnabled");

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)}>
      <ScrollArea className="max-h-[60vh] pr-4">
        <div className="space-y-4 pt-1">

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-name`}>
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${formId}-name`}
              {...register("name")}
              placeholder="e.g. Excel Task A"
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-description`}>
              Description <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${formId}-description`}
              {...register("description")}
              placeholder="Short description"
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Price + Order */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-price`}>Price per Good ID</Label>
              <Input
                id={`${formId}-price`}
                type="number"
                min={0}
                step="any"
                {...register("pricePerGoodId")}
              />
              {errors.pricePerGoodId && (
                <p className="text-xs text-destructive">{errors.pricePerGoodId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-order`}>Display Order</Label>
              <Input
                id={`${formId}-order`}
                type="number"
                min={0}
                {...register("displayOrder")}
              />
              {errors.displayOrder && (
                <p className="text-xs text-destructive">{errors.displayOrder.message}</p>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium leading-none">Status</p>
              <p className="text-xs text-muted-foreground mt-1">
                {status === "active" ? "Category is active" : "Category is inactive"}
              </p>
            </div>
            <Switch
              checked={status === "active"}
              onCheckedChange={(checked) =>
                setValue("status", checked ? "active" : "inactive", {
                  shouldValidate: true,
                })
              }
            />
          </div>

          {/* Submit Enabled */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium leading-none">Submit Enabled</p>
              <p className="text-xs text-muted-foreground mt-1">
                Allow users to submit in this category
              </p>
            </div>
            <Switch
              checked={submitEnabled}
              onCheckedChange={(checked) =>
                setValue("submitEnabled", checked, { shouldValidate: true })
              }
            />
          </div>

          <Separator />

          {/* Daily Limit */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium leading-none">Daily Limit</p>
              <p className="text-xs text-muted-foreground mt-1">
                Restrict how many submissions per day
              </p>
            </div>
            <Switch
              checked={dailyLimitEnabled}
              onCheckedChange={(checked) =>
                setValue("dailyLimitEnabled", checked, { shouldValidate: true })
              }
            />
          </div>

          {dailyLimitEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-dailySubmitCount`}>Daily Submit Count</Label>
              <Input
                id={`${formId}-dailySubmitCount`}
                type="number"
                min={0}
                {...register("dailySubmitCount")}
              />
              {errors.dailySubmitCount && (
                <p className="text-xs text-destructive">{errors.dailySubmitCount.message}</p>
              )}
            </div>
          )}

          {/* Time Window */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-submitStartTime`}>Submit Start Time</Label>
              <Input
                id={`${formId}-submitStartTime`}
                type="time"
                {...register("submitStartTime")}
              />
              {errors.submitStartTime && (
                <p className="text-xs text-destructive">{errors.submitStartTime.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-submitEndTime`}>Submit End Time</Label>
              <Input
                id={`${formId}-submitEndTime`}
                type="time"
                {...register("submitEndTime")}
              />
              {errors.submitEndTime && (
                <p className="text-xs text-destructive">{errors.submitEndTime.message}</p>
              )}
            </div>
          </div>

          {/* Countdown Support */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium leading-none">Countdown Support</p>
              <p className="text-xs text-muted-foreground mt-1">
                Show countdown timer to users
              </p>
            </div>
            <Switch
              checked={countdownSupport}
              onCheckedChange={(checked) =>
                setValue("countdownSupport", checked, { shouldValidate: true })
              }
            />
          </div>

          <Separator />

          {/* Duplicate Check */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium leading-none">Duplicate Check</p>
              <p className="text-xs text-muted-foreground mt-1">
                Reject duplicate ID submissions
              </p>
            </div>
            <Switch
              checked={duplicateCheck}
              onCheckedChange={(checked) =>
                setValue("duplicateCheck", checked, { shouldValidate: true })
              }
            />
          </div>

          {/* Recheck Enabled */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium leading-none">Recheck Enabled</p>
              <p className="text-xs text-muted-foreground mt-1">
                Allow re-checking previously submitted IDs
              </p>
            </div>
            <Switch
              checked={recheckEnabled}
              onCheckedChange={(checked) =>
                setValue("recheckEnabled", checked, { shouldValidate: true })
              }
            />
          </div>

          {/* Min / Max IDs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-minIds`}>Min IDs</Label>
              <Input
                id={`${formId}-minIds`}
                type="number"
                min={0}
                {...register("minIds")}
              />
              {errors.minIds && (
                <p className="text-xs text-destructive">{errors.minIds.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-maxIds`}>Max IDs</Label>
              <Input
                id={`${formId}-maxIds`}
                type="number"
                min={0}
                {...register("maxIds")}
              />
              {errors.maxIds && (
                <p className="text-xs text-destructive">{errors.maxIds.message}</p>
              )}
            </div>
          </div>

        </div>
      </ScrollArea>
    </form>
  );
}

// ── SwitchRow helper ──────────────────────────────────────────────────────────

function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// ── StatCard helper ───────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

// ── Category Edit Dialog (tabbed) ─────────────────────────────────────────────

const EDIT_FORM_ID = "edit-category-form";

/** Shape passed to the parent's onSubmit — includes sheet config from local state */
type CategoryEditSubmitData = CategoryEditFormValues & {
  sheetConfig: SheetConfig;
};

type TestStatus = "idle" | "loading" | "success" | "error";

function CategoryEditDialog({
  editTarget,
  onClose,
  onSubmit,
  isPending,
}: {
  editTarget: Category | null;
  onClose: () => void;
  onSubmit: (data: CategoryEditSubmitData) => void;
  isPending: boolean;
}) {
  // Google Sheet state (persisted via main "Save Changes")
  const [sheetId, setSheetId] = useState("");
  const [worksheetName, setWorksheetName] = useState("");
  const [columns, setColumns] = useState<string[]>(DEFAULT_SHEET_COLUMNS);
  const [newColumnName, setNewColumnName] = useState("");

  // Test connection state
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<CategoryEditFormValues>({
    resolver: zodResolver(categoryEditSchema),
    defaultValues: { ...defaultValues, categoryIcon: "" },
  });

  // Populate form + sheet state whenever the target category changes
  useEffect(() => {
    if (!editTarget) return;
    reset({
      name: editTarget.name,
      description: editTarget.description,
      status: editTarget.status,
      submitEnabled: editTarget.submitEnabled,
      pricePerGoodId: editTarget.pricePerGoodId,
      displayOrder: editTarget.displayOrder,
      dailyLimitEnabled: editTarget.dailyLimitEnabled,
      dailySubmitCount: editTarget.dailySubmitCount,
      submitStartTime: editTarget.submitStartTime,
      submitEndTime: editTarget.submitEndTime,
      countdownSupport: editTarget.countdownSupport,
      duplicateCheck: editTarget.duplicateCheck,
      recheckEnabled: editTarget.recheckEnabled,
      minIds: editTarget.minIds,
      maxIds: editTarget.maxIds,
      categoryIcon: "",
    });
    // Restore saved sheet config or fall back to defaults
    const cfg = editTarget.sheetConfig;
    setSheetId(cfg?.sheetId ?? "");
    setWorksheetName(cfg?.worksheetName ?? "");
    setColumns(cfg?.columns?.length ? cfg.columns : DEFAULT_SHEET_COLUMNS);
    setNewColumnName("");
    setTestStatus("idle");
    setTestMessage("");
  }, [editTarget?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = watch("status");
  const submitEnabled = watch("submitEnabled");
  const dailyLimitEnabled = watch("dailyLimitEnabled");
  const duplicateCheck = watch("duplicateCheck");
  const recheckEnabled = watch("recheckEnabled");

  // Column reorder helpers
  function moveColumn(index: number, direction: "up" | "down") {
    const next = [...columns];
    const swap = direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setColumns(next);
  }

  function removeColumn(index: number) {
    setColumns((prev) => prev.filter((_, i) => i !== index));
  }

  function addColumn() {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    setColumns((prev) => [...prev, trimmed]);
    setNewColumnName("");
  }

  // Test connection handler
  async function handleTestConnection() {
    if (!editTarget) return;
    if (!sheetId.trim() || !worksheetName.trim()) {
      setTestStatus("error");
      setTestMessage("❌ Please enter both Sheet ID and Worksheet Name before testing.");
      return;
    }
    setTestStatus("loading");
    setTestMessage("");
    try {
      const result = await testSheetConnection(editTarget.id, sheetId.trim(), worksheetName.trim());
      setTestStatus("success");
      setTestMessage(result.message);
    } catch (err) {
      setTestStatus("error");
      setTestMessage((err as Error).message || "❌ Connection test failed");
    }
  }

  // Wrap form submit to inject sheetConfig from local state
  function handleInternalSubmit(formData: CategoryEditFormValues) {
    onSubmit({
      ...formData,
      sheetConfig: {
        sheetId: sheetId.trim(),
        worksheetName: worksheetName.trim(),
        columns,
      },
    });
  }

  return (
    <Dialog
      open={!!editTarget}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex flex-col w-[calc(100%-2rem)] sm:w-auto sm:max-w-[580px] p-0 gap-0 max-h-[90dvh] sm:max-h-[88vh]">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold">
            Edit Category
            {editTarget && (
              <span className="ml-2 text-muted-foreground font-normal text-sm">
                — {editTarget.name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <form id={EDIT_FORM_ID} onSubmit={handleSubmit(handleInternalSubmit)} className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Tabs defaultValue="general" className="flex-1 min-h-0 flex flex-col w-full">
            {/* Tab bar — horizontally scrollable on mobile */}
            <div className="shrink-0 px-6 pt-4 border-b border-border overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <TabsList className="h-auto p-0 bg-transparent rounded-none gap-0 min-w-max justify-start">
                {[
                  { value: "general", label: "General", icon: Settings },
                  { value: "submission", label: "Submission", icon: Send },
                  { value: "sheet", label: "Google Sheet", icon: FileSpreadsheet },
                  { value: "statistics", label: "Statistics", icon: BarChart3 },
                ].map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="
                      relative rounded-none bg-transparent px-4 py-2.5 text-sm font-medium
                      text-muted-foreground shadow-none border-0
                      data-[state=active]:text-primary data-[state=active]:bg-transparent
                      data-[state=active]:shadow-none
                      after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5
                      after:bg-transparent data-[state=active]:after:bg-primary
                      hover:text-foreground transition-colors
                      flex items-center gap-1.5
                    "
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* ── General Tab ──────────────────────────────────────────────── */}
            <TabsContent value="general" className="mt-0 flex-1 min-h-0 overflow-y-auto">
              <div className="px-6 py-5 space-y-4">

                  {/* Category Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-name">
                      Category Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="edit-name"
                      {...register("name")}
                      placeholder="e.g. Excel Task A"
                    />
                    {errors.name && (
                      <p className="text-xs text-destructive">{errors.name.message}</p>
                    )}
                  </div>

                  {/* Status */}
                  <SwitchRow
                    label="Status"
                    description={status === "active" ? "Category is active" : "Category is inactive"}
                    checked={status === "active"}
                    onCheckedChange={(checked) =>
                      setValue("status", checked ? "active" : "inactive", { shouldValidate: true })
                    }
                  />

                  {/* Display Order + Price */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-order">Display Order</Label>
                      <Input
                        id="edit-order"
                        type="number"
                        min={0}
                        {...register("displayOrder")}
                      />
                      {errors.displayOrder && (
                        <p className="text-xs text-destructive">{errors.displayOrder.message}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-price">Price Per ID</Label>
                      <Input
                        id="edit-price"
                        type="number"
                        min={0}
                        step="any"
                        {...register("pricePerGoodId")}
                      />
                      {errors.pricePerGoodId && (
                        <p className="text-xs text-destructive">{errors.pricePerGoodId.message}</p>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-description">
                      Description <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="edit-description"
                      {...register("description")}
                      placeholder="Short description"
                    />
                    {errors.description && (
                      <p className="text-xs text-destructive">{errors.description.message}</p>
                    )}
                  </div>

                  {/* Category Icon */}
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-icon">Category Icon</Label>
                    <Input
                      id="edit-icon"
                      {...register("categoryIcon")}
                      placeholder="Emoji or icon code, e.g. 📊"
                      maxLength={8}
                    />
                    <p className="text-xs text-muted-foreground">
                      Paste an emoji or short icon identifier shown in the bot menu.
                    </p>
                  </div>

                </div>
            </TabsContent>

            {/* ── Submission Tab ───────────────────────────────────────────── */}
            <TabsContent value="submission" className="mt-0 flex-1 min-h-0 overflow-y-auto">
              <div className="px-6 py-5 space-y-4">

                  <SwitchRow
                    label="Submission Enable"
                    description="Allow users to submit in this category"
                    checked={submitEnabled}
                    onCheckedChange={(checked) =>
                      setValue("submitEnabled", checked, { shouldValidate: true })
                    }
                  />

                  <SwitchRow
                    label="Duplicate Check"
                    description="Reject duplicate ID submissions"
                    checked={duplicateCheck}
                    onCheckedChange={(checked) =>
                      setValue("duplicateCheck", checked, { shouldValidate: true })
                    }
                  />

                  <Separator />

                  <SwitchRow
                    label="Daily Limit Enable"
                    description="Restrict how many submissions per day"
                    checked={dailyLimitEnabled}
                    onCheckedChange={(checked) =>
                      setValue("dailyLimitEnabled", checked, { shouldValidate: true })
                    }
                  />

                  {dailyLimitEnabled && (
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-dailyCount">Daily Limit Count</Label>
                      <Input
                        id="edit-dailyCount"
                        type="number"
                        min={0}
                        {...register("dailySubmitCount")}
                      />
                      {errors.dailySubmitCount && (
                        <p className="text-xs text-destructive">{errors.dailySubmitCount.message}</p>
                      )}
                    </div>
                  )}

                  <Separator />

                  <SwitchRow
                    label="Recheck Enable"
                    description="Allow re-checking previously submitted IDs"
                    checked={recheckEnabled}
                    onCheckedChange={(checked) =>
                      setValue("recheckEnabled", checked, { shouldValidate: true })
                    }
                  />

                  <Separator />

                  {/* Time window */}
                  <div>
                    <p className="text-sm font-medium mb-3">Submission Window</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-startTime">Start Time</Label>
                        <Input
                          id="edit-startTime"
                          type="time"
                          {...register("submitStartTime")}
                        />
                        {errors.submitStartTime && (
                          <p className="text-xs text-destructive">{errors.submitStartTime.message}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-endTime">End Time</Label>
                        <Input
                          id="edit-endTime"
                          type="time"
                          {...register("submitEndTime")}
                        />
                        {errors.submitEndTime && (
                          <p className="text-xs text-destructive">{errors.submitEndTime.message}</p>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
            </TabsContent>

            {/* ── Google Sheet Tab ─────────────────────────────────────────── */}
            <TabsContent value="sheet" className="mt-0 flex-1 min-h-0 overflow-y-auto">
              <div className="px-6 py-5 space-y-5">

                  {/* Sheet ID */}
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-sheetId">Google Sheet ID</Label>
                    <Input
                      id="edit-sheetId"
                      value={sheetId}
                      onChange={(e) => { setSheetId(e.target.value); setTestStatus("idle"); }}
                      placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                    />
                    <p className="text-xs text-muted-foreground">
                      Found in the Google Sheets URL after /d/
                    </p>
                  </div>

                  {/* Worksheet Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-worksheetName">Worksheet Name</Label>
                    <Input
                      id="edit-worksheetName"
                      value={worksheetName}
                      onChange={(e) => { setWorksheetName(e.target.value); setTestStatus("idle"); }}
                      placeholder="e.g. Sheet1"
                    />
                  </div>

                  {/* Test Connection */}
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={testStatus === "loading"}
                      className="self-start"
                    >
                      {testStatus === "loading" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                      )}
                      Test Connection
                    </Button>
                    {testMessage && (
                      <p
                        className={`text-sm font-medium ${
                          testStatus === "success"
                            ? "text-green-600 dark:text-green-400"
                            : "text-destructive"
                        }`}
                      >
                        {testMessage}
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Expected Admin Columns */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium">Expected Admin Columns</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Drag to reorder using the arrows
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {columns.map((col, i) => (
                        <div
                          key={`${col}-${i}`}
                          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                          <span className="flex-1 text-sm font-medium">{col}</span>
                          <div className="flex items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              disabled={i === 0}
                              onClick={() => moveColumn(i, "up")}
                              aria-label="Move up"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              disabled={i === columns.length - 1}
                              onClick={() => moveColumn(i, "down")}
                              aria-label="Move down"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => removeColumn(i)}
                              aria-label={`Remove ${col}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add extra column */}
                    <div className="flex gap-2 mt-3">
                      <Input
                        value={newColumnName}
                        onChange={(e) => setNewColumnName(e.target.value)}
                        placeholder="Extra column name"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addColumn();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addColumn}
                        disabled={!newColumnName.trim()}
                        className="shrink-0"
                      >
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add Column
                      </Button>
                    </div>
                  </div>

                </div>
            </TabsContent>

            {/* ── Statistics Tab ───────────────────────────────────────────── */}
            <TabsContent value="statistics" className="mt-0 flex-1 min-h-0 overflow-y-auto">
              <div className="px-6 py-5">
                <p className="text-xs text-muted-foreground mb-4">
                  Read-only summary for this category.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatCard label="Total Submission" value="—" />
                  <StatCard label="Today's Submission" value="—" />
                  <StatCard label="Duplicate" value="—" />
                  <StatCard label="Invalid" value="—" />
                  <StatCard label="Accepted" value="—" />
                  <StatCard label="Rejected" value="—" />
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  Statistics backend integration coming soon.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </form>

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button form={EDIT_FORM_ID} type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const { data: categories, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  // ── Mutations ───────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setCreateOpen(false);
      toast({ title: "Category created", description: "Category was created successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Category> }) =>
      updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setEditTarget(null);
      toast({ title: "Category updated", description: "Changes saved successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setDeleteTarget(null);
      toast({ title: "Category deleted", description: "The category was removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  // ── Submit handlers ─────────────────────────────────────────────────────────

  function handleCreate(data: CategoryFormValues) {
    createMutation.mutate(data);
  }

  function handleEdit(data: CategoryEditSubmitData) {
    if (!editTarget) return;
    // Strip UI-only fields before sending to API; sheetConfig is included
    const { categoryIcon: _icon, ...rest } = data;
    updateMutation.mutate({ id: editTarget.id, data: rest });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" data-testid="page-categories">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Manage task categories, pricing, and submission rules
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Category
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading categories…</p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="bg-card border border-border rounded-xl p-10 text-center shadow-sm">
          <AlertCircle className="h-10 w-10 mx-auto mb-4 text-destructive opacity-70" />
          <h3 className="text-base font-medium text-foreground mb-1">
            Failed to load categories
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {(error as Error)?.message ?? "An unexpected error occurred."}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && categories && categories.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground shadow-sm">
          <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-20 text-foreground" />
          <h3 className="text-lg font-medium text-foreground mb-2">No categories yet</h3>
          <p className="text-sm max-w-md mx-auto mb-6">
            Create your first category to start managing task types and submission rules.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Category
          </Button>
        </div>
      )}

      {/* Category Cards */}
      {!isLoading && !isError && categories && categories.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col transition-shadow hover:shadow-md"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                        cat.status === "active"
                          ? "bg-emerald-500"
                          : "bg-slate-400"
                      }`}
                    />
                    <h3 className="font-semibold text-foreground text-[15px] leading-tight truncate">
                      {cat.name}
                    </h3>
                  </div>
                  {cat.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 pl-4">
                      {cat.description}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xl font-bold text-foreground leading-none">
                    {cat.pricePerGoodId}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                    per ID
                  </p>
                </div>
              </div>

              <Separator />

              {/* Status Badges */}
              <div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
                <Badge
                  variant="outline"
                  className={
                    cat.status === "active"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                      : "border-border bg-muted text-muted-foreground"
                  }
                >
                  <span
                    className={`mr-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                      cat.status === "active" ? "bg-emerald-500" : "bg-slate-400"
                    }`}
                  />
                  {cat.status === "active" ? "Active" : "Inactive"}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    cat.submitEnabled
                      ? "border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800"
                      : "border-border bg-muted text-muted-foreground"
                  }
                >
                  {cat.submitEnabled ? "Submit Open" : "Submit Closed"}
                </Badge>
                {cat.dailyLimitEnabled && (
                  <Badge variant="outline" className="text-muted-foreground">
                    {cat.dailySubmitCount}/day
                  </Badge>
                )}
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
                <div className="px-3 py-2.5 text-center">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                    Window
                  </p>
                  <p className="text-xs font-semibold text-foreground tabular-nums">
                    {cat.submitStartTime}–{cat.submitEndTime}
                  </p>
                </div>
                <div className="px-3 py-2.5 text-center">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                    IDs
                  </p>
                  <p className="text-xs font-semibold text-foreground tabular-nums">
                    {cat.minIds}–{cat.maxIds}
                  </p>
                </div>
                <div className="px-3 py-2.5 text-center">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                    Order
                  </p>
                  <p className="text-xs font-semibold text-foreground tabular-nums">
                    {cat.displayOrder}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1 px-4 py-2.5 border-t border-border bg-muted/30">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditTarget(cat)}
                  aria-label={`Edit ${cat.name}`}
                  className="h-8 px-3 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteTarget(cat)}
                  aria-label={`Delete ${cat.name}`}
                  className="h-8 px-3 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create Dialog (unchanged flat form) ───────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Create Category</DialogTitle>
          </DialogHeader>
          <CategoryForm
            key="create"
            formId="create-category-form"
            initialValues={defaultValues}
            onSubmit={handleCreate}
          />
          <DialogFooter>
            <Button
              form="create-category-form"
              type="submit"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog (new tabbed UI) ────────────────────────────────────── */}
      <CategoryEditDialog
        editTarget={editTarget}
        onClose={() => setEditTarget(null)}
        onSubmit={handleEdit}
        isPending={updateMutation.isPending}
      />

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
