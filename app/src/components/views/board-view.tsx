"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  rectIntersection,
  pointerWithin,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useAppStore, Feature, FeatureImage } from "@/store/app-store";
import { getElectronAPI } from "@/lib/electron";
import { cn } from "@/lib/utils";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategoryAutocomplete } from "@/components/ui/category-autocomplete";
import { FeatureImageUpload } from "@/components/ui/feature-image-upload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { AutoModeLog } from "./auto-mode-log";
import { AgentOutputModal } from "./agent-output-modal";
import { Plus, RefreshCw, Play, StopCircle, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { useAutoMode } from "@/hooks/use-auto-mode";

type ColumnId = Feature["status"];

const COLUMNS: { id: ColumnId; title: string; color: string }[] = [
  { id: "backlog", title: "Backlog", color: "bg-zinc-500" },
  { id: "in_progress", title: "In Progress", color: "bg-yellow-500" },
  { id: "verified", title: "Verified", color: "bg-green-500" },
];

export function BoardView() {
  const {
    currentProject,
    features,
    setFeatures,
    addFeature,
    updateFeature,
    removeFeature,
    moveFeature,
    runningAutoTasks,
  } = useAppStore();
  const [activeFeature, setActiveFeature] = useState<Feature | null>(null);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newFeature, setNewFeature] = useState({
    category: "",
    description: "",
    steps: [""],
    images: [] as FeatureImage[],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [outputFeature, setOutputFeature] = useState<Feature | null>(null);

  // Make current project available globally for modal
  useEffect(() => {
    if (currentProject) {
      (window as any).__currentProject = currentProject;
    }
    return () => {
      (window as any).__currentProject = null;
    };
  }, [currentProject]);

  // Auto mode hook
  const autoMode = useAutoMode();

  // Prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Get unique categories from existing features for autocomplete suggestions
  const categorySuggestions = useMemo(() => {
    const categories = features.map((f) => f.category).filter(Boolean);
    return [...new Set(categories)].sort();
  }, [features]);

  // Custom collision detection that prioritizes columns over cards
  const collisionDetectionStrategy = useCallback((args: any) => {
    // First, check if pointer is within a column
    const pointerCollisions = pointerWithin(args);
    const columnCollisions = pointerCollisions.filter((collision: any) =>
      COLUMNS.some((col) => col.id === collision.id)
    );

    // If we found a column collision, use that
    if (columnCollisions.length > 0) {
      return columnCollisions;
    }

    // Otherwise, use rectangle intersection for cards
    return rectIntersection(args);
  }, []);

  // Load features from file
  const loadFeatures = useCallback(async () => {
    if (!currentProject) return;

    setIsLoading(true);
    try {
      const api = getElectronAPI();
      const result = await api.readFile(
        `${currentProject.path}/.automaker/feature_list.json`
      );

      if (result.success && result.content) {
        const parsed = JSON.parse(result.content);
        const featuresWithIds = parsed.map(
          (f: any, index: number) => ({
            ...f,
            id: f.id || `feature-${index}-${Date.now()}`,
            status: f.status || "backlog",
          })
        );
        setFeatures(featuresWithIds);
      }
    } catch (error) {
      console.error("Failed to load features:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, setFeatures]);

  // Auto-show activity log when auto mode starts
  useEffect(() => {
    if (autoMode.isRunning && !showActivityLog) {
      setShowActivityLog(true);
    }
  }, [autoMode.isRunning, showActivityLog]);

  // Listen for auto mode feature completion and reload features
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event) => {
      if (event.type === "auto_mode_feature_complete") {
        // Reload features when a feature is completed
        console.log("[Board] Feature completed, reloading features...");
        loadFeatures();
      }
    });

    return unsubscribe;
  }, [loadFeatures]);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  // Save features to file
  const saveFeatures = useCallback(async () => {
    if (!currentProject) return;

    try {
      const api = getElectronAPI();
      const toSave = features.map((f) => ({
        id: f.id,
        category: f.category,
        description: f.description,
        steps: f.steps,
        status: f.status,
      }));
      await api.writeFile(
        `${currentProject.path}/.automaker/feature_list.json`,
        JSON.stringify(toSave, null, 2)
      );
    } catch (error) {
      console.error("Failed to save features:", error);
    }
  }, [currentProject, features]);

  // Save when features change (after initial load is complete)
  useEffect(() => {
    if (!isLoading) {
      saveFeatures();
    }
  }, [features, saveFeatures, isLoading]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const feature = features.find((f) => f.id === active.id);
    if (feature) {
      setActiveFeature(feature);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveFeature(null);

    if (!over) return;

    const featureId = active.id as string;
    const overId = over.id as string;

    // Find the feature being dragged
    const draggedFeature = features.find((f) => f.id === featureId);
    if (!draggedFeature) return;

    // Only allow dragging from backlog
    if (draggedFeature.status !== "backlog") {
      console.log("[Board] Cannot drag feature that is already in progress or verified");
      return;
    }

    let targetStatus: ColumnId | null = null;

    // Check if we dropped on a column
    const column = COLUMNS.find((c) => c.id === overId);
    if (column) {
      targetStatus = column.id;
    } else {
      // Dropped on another feature - find its column
      const overFeature = features.find((f) => f.id === overId);
      if (overFeature) {
        targetStatus = overFeature.status;
      }
    }

    if (!targetStatus) return;

    // Move the feature
    moveFeature(featureId, targetStatus);

    // If moved to in_progress, trigger the agent
    if (targetStatus === "in_progress") {
      console.log("[Board] Feature moved to in_progress, starting agent...");
      await handleRunFeature(draggedFeature);
    }
  };

  const handleAddFeature = () => {
    addFeature({
      category: newFeature.category || "Uncategorized",
      description: newFeature.description,
      steps: newFeature.steps.filter((s) => s.trim()),
      status: "backlog",
      images: newFeature.images,
    });
    setNewFeature({ category: "", description: "", steps: [""], images: [] });
    setShowAddDialog(false);
  };

  const handleUpdateFeature = () => {
    if (!editingFeature) return;

    updateFeature(editingFeature.id, {
      category: editingFeature.category,
      description: editingFeature.description,
      steps: editingFeature.steps,
    });
    setEditingFeature(null);
  };

  const handleDeleteFeature = (featureId: string) => {
    if (window.confirm("Are you sure you want to delete this feature?")) {
      removeFeature(featureId);
    }
  };

  const handleRunFeature = async (feature: Feature) => {
    if (!currentProject) return;

    try {
      const api = getElectronAPI();
      if (!api?.autoMode) {
        console.error("Auto mode API not available");
        return;
      }

      // Call the API to run this specific feature by ID
      const result = await api.autoMode.runFeature(
        currentProject.path,
        feature.id
      );

      if (result.success) {
        console.log("[Board] Feature run started successfully");
        // The feature status will be updated by the auto mode service
        // and the UI will reload features when the agent completes (via event listener)
      } else {
        console.error("[Board] Failed to run feature:", result.error);
        // Reload to revert the UI status change
        await loadFeatures();
      }
    } catch (error) {
      console.error("[Board] Error running feature:", error);
      // Reload to revert the UI status change
      await loadFeatures();
    }
  };

  const handleVerifyFeature = async (feature: Feature) => {
    if (!currentProject) return;

    console.log("[Board] Verifying feature:", { id: feature.id, description: feature.description });

    try {
      const api = getElectronAPI();
      if (!api?.autoMode) {
        console.error("Auto mode API not available");
        return;
      }

      // Call the API to verify this specific feature by ID
      const result = await api.autoMode.verifyFeature(
        currentProject.path,
        feature.id
      );

      if (result.success) {
        console.log("[Board] Feature verification started successfully");
        // The feature status will be updated by the auto mode service
        // and the UI will reload features when verification completes
      } else {
        console.error("[Board] Failed to verify feature:", result.error);
        await loadFeatures();
      }
    } catch (error) {
      console.error("[Board] Error verifying feature:", error);
      await loadFeatures();
    }
  };

  const getColumnFeatures = (columnId: ColumnId) => {
    return features.filter((f) => f.status === columnId);
  };

  const handleViewOutput = (feature: Feature) => {
    setOutputFeature(feature);
    setShowOutputModal(true);
  };

  if (!currentProject) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="board-view-no-project"
      >
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="board-view-loading"
      >
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg relative"
      data-testid="board-view"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-950/50 backdrop-blur-md">
        <div>
          <h1 className="text-xl font-bold">Kanban Board</h1>
          <p className="text-sm text-muted-foreground">{currentProject.name}</p>
        </div>
        <div className="flex gap-2">
          {/* Auto Mode Toggle - only show after mount to prevent hydration issues */}
          {isMounted && (
            <>
              {autoMode.isRunning ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => autoMode.stop()}
                  data-testid="stop-auto-mode"
                >
                  <StopCircle className="w-4 h-4 mr-2" />
                  Stop Auto Mode
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => autoMode.start()}
                  data-testid="start-auto-mode"
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Auto Mode
                </Button>
              )}
            </>
          )}

          {isMounted && autoMode.isRunning && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowActivityLog(!showActivityLog)}
              data-testid="toggle-activity-log"
            >
              <Loader2 className="w-4 h-4 mr-2 animate-spin text-purple-500" />
              Activity
              {showActivityLog ? (
                <ChevronDown className="w-4 h-4 ml-2" />
              ) : (
                <ChevronUp className="w-4 h-4 ml-2" />
              )}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={loadFeatures}
            data-testid="refresh-board"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setShowAddDialog(true)}
            data-testid="add-feature-button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Feature
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Kanban Columns */}
        <div className={cn(
          "flex-1 overflow-x-auto p-4",
          showActivityLog && "transition-all"
        )}>
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full min-w-max">
            {COLUMNS.map((column) => {
              const columnFeatures = getColumnFeatures(column.id);
              return (
                <KanbanColumn
                  key={column.id}
                  id={column.id}
                  title={column.title}
                  color={column.color}
                  count={columnFeatures.length}
                >
                  <SortableContext
                    items={columnFeatures.map((f) => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {columnFeatures.map((feature) => (
                      <KanbanCard
                        key={feature.id}
                        feature={feature}
                        onEdit={() => setEditingFeature(feature)}
                        onDelete={() => handleDeleteFeature(feature.id)}
                        onViewOutput={() => handleViewOutput(feature)}
                        onVerify={() => handleVerifyFeature(feature)}
                        isCurrentAutoTask={runningAutoTasks.includes(feature.id)}
                      />
                    ))}
                  </SortableContext>
                </KanbanColumn>
              );
            })}
          </div>

          <DragOverlay>
            {activeFeature && (
              <Card className="w-72 opacity-90 rotate-3 shadow-xl">
                <CardHeader className="p-3">
                  <CardTitle className="text-sm">
                    {activeFeature.description}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {activeFeature.category}
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </DragOverlay>
        </DndContext>
        </div>

        {/* Activity Log Panel */}
        {showActivityLog && (
          <div className="w-96 border-l border-white/10 flex-shrink-0">
            <AutoModeLog onClose={() => setShowActivityLog(false)} />
          </div>
        )}
      </div>

      {/* Add Feature Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent data-testid="add-feature-dialog">
          <DialogHeader>
            <DialogTitle>Add New Feature</DialogTitle>
            <DialogDescription>
              Create a new feature card for the Kanban board.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <CategoryAutocomplete
                value={newFeature.category}
                onChange={(value) =>
                  setNewFeature({ ...newFeature, category: value })
                }
                suggestions={categorySuggestions}
                placeholder="e.g., Core, UI, API"
                data-testid="feature-category-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the feature..."
                value={newFeature.description}
                onChange={(e) =>
                  setNewFeature({ ...newFeature, description: e.target.value })
                }
                data-testid="feature-description-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Steps</Label>
              {newFeature.steps.map((step, index) => (
                <Input
                  key={index}
                  placeholder={`Step ${index + 1}`}
                  value={step}
                  onChange={(e) => {
                    const steps = [...newFeature.steps];
                    steps[index] = e.target.value;
                    setNewFeature({ ...newFeature, steps });
                  }}
                  data-testid={`feature-step-${index}-input`}
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setNewFeature({
                    ...newFeature,
                    steps: [...newFeature.steps, ""],
                  })
                }
                data-testid="add-step-button"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Step
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddFeature}
              disabled={!newFeature.description}
              data-testid="confirm-add-feature"
            >
              Add Feature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Feature Dialog */}
      <Dialog
        open={!!editingFeature}
        onOpenChange={() => setEditingFeature(null)}
      >
        <DialogContent data-testid="edit-feature-dialog">
          <DialogHeader>
            <DialogTitle>Edit Feature</DialogTitle>
            <DialogDescription>Modify the feature details.</DialogDescription>
          </DialogHeader>
          {editingFeature && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <CategoryAutocomplete
                  value={editingFeature.category}
                  onChange={(value) =>
                    setEditingFeature({
                      ...editingFeature,
                      category: value,
                    })
                  }
                  suggestions={categorySuggestions}
                  placeholder="e.g., Core, UI, API"
                  data-testid="edit-feature-category"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  value={editingFeature.description}
                  onChange={(e) =>
                    setEditingFeature({
                      ...editingFeature,
                      description: e.target.value,
                    })
                  }
                  data-testid="edit-feature-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Steps</Label>
                {editingFeature.steps.map((step, index) => (
                  <Input
                    key={index}
                    value={step}
                    onChange={(e) => {
                      const steps = [...editingFeature.steps];
                      steps[index] = e.target.value;
                      setEditingFeature({ ...editingFeature, steps });
                    }}
                    data-testid={`edit-feature-step-${index}`}
                  />
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditingFeature({
                      ...editingFeature,
                      steps: [...editingFeature.steps, ""],
                    })
                  }
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Step
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingFeature(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateFeature}
              data-testid="confirm-edit-feature"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agent Output Modal */}
      <AgentOutputModal
        open={showOutputModal}
        onClose={() => setShowOutputModal(false)}
        featureDescription={outputFeature?.description || ""}
        featureId={outputFeature?.id || ""}
      />
    </div>
  );
}
