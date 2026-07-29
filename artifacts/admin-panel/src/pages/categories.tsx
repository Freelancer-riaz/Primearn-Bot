import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, FolderTree, Pencil, Trash2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  type Category,
} from "@/lib/api";

// ── Validation schema ─────────────────────────────────────────────────────────

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

type CategoryFormValues = z.infer<typeof categorySchema>;

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

// ── Shared form (used by both Create and Edit dialogs) ────────────────────────

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

  function handleEdit(data: CategoryFormValues) {
    if (!editTarget) return;
    updateMutation.mutate({ id: editTarget.id, data });
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

      {/* Table */}
      {!isLoading && !isError && categories && categories.length > 0 && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submit Enabled</TableHead>
                <TableHead className="text-right">Price / Good ID</TableHead>
                <TableHead className="text-right">Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">
                    {cat.description}
                  </TableCell>
                  <TableCell>
                    <Badge variant={cat.status === "active" ? "default" : "secondary"}>
                      {cat.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={cat.submitEnabled ? "default" : "secondary"}>
                      {cat.submitEnabled ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{cat.pricePerGoodId}</TableCell>
                  <TableCell className="text-right">{cat.displayOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditTarget(cat)}
                        aria-label={`Edit ${cat.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(cat)}
                        aria-label={`Delete ${cat.name}`}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Create Dialog ─────────────────────────────────────────────────────── */}
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

      {/* ── Edit Dialog ───────────────────────────────────────────────────────── */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <CategoryForm
              key={editTarget.id}
              formId="edit-category-form"
              initialValues={{
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
              }}
              onSubmit={handleEdit}
            />
          )}
          <DialogFooter>
            <Button
              form="edit-category-form"
              type="submit"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ───────────────────────────────────────────────── */}
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
