import React, { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Plus, ListTodo, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import TaskForm from "@/components/tasks/TaskForm";
import TaskItem from "@/components/tasks/TaskItem";

const filters = [
  { key: "all", label: "Alla" },
  { key: "todo", label: "Att göra" },
  { key: "in_progress", label: "Pågår" },
  { key: "done", label: "Klart" },
];

const sortOptions = [
  { key: "-created_date", label: "Nyaste" },
  { key: "created_date", label: "Äldst" },
  { key: "due_date", label: "Förfallodatum" },
];

export default function Home() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("-created_date");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [stats, setStats] = useState({ all: 0, todo: 0, in_progress: 0, done: 0 });

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (activeFilter !== "all") query.status = activeFilter;
      if (search.trim()) {
        query.title = { $regex: search.trim(), $options: "i" };
      }
      const page = await base44.entities.Task.filter(query, {
        sort: sortBy,
        limit: 50,
      });
      setTasks(page.items || []);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, search, sortBy]);

  const loadStats = useCallback(async () => {
    try {
      const res = await base44.entities.Task.aggregate({ groupBy: "status" });
      const next = { all: 0, todo: 0, in_progress: 0, done: 0 };
      for (const row of res.rows || []) {
        next[row.status] = row.count || 0;
        next.all += row.count || 0;
      }
      setStats(next);
    } catch {
      setStats({ all: 0, todo: 0, in_progress: 0, done: 0 });
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refresh = async () => {
    await Promise.all([loadTasks(), loadStats()]);
  };

  const handleCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (task) => {
    setEditing(task);
    setFormOpen(true);
  };

  const handleSubmit = async (data) => {
    if (editing) {
      await base44.entities.Task.update(editing.id, data);
    } else {
      await base44.entities.Task.create(data);
    }
    setFormOpen(false);
    setEditing(null);
    await refresh();
  };

  const handleToggle = async (task) => {
    const next = task.status === "done" ? "todo" : "done";
    await base44.entities.Task.update(task.id, { status: next });
    await refresh();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await base44.entities.Task.delete(deleting.id);
    setDeleting(null);
    await refresh();
  };

  const progress = useMemo(() => {
    if (stats.all === 0) return 0;
    return Math.round((stats.done / stats.all) * 100);
  }, [stats]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ListTodo className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight font-heading">Mina uppgifter</h1>
          </div>
          <p className="text-sm text-muted-foreground">Håll koll på vad som ska göras.</p>
        </header>

        {stats.all > 0 && (
          <div className="mb-6 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Förlopp</span>
              <span className="text-sm text-muted-foreground">
                {stats.done} av {stats.all} klara · {progress}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök uppgifter…"
              className="pl-9"
            />
          </div>
          <Button onClick={handleCreate} size="sm" className="shrink-0">
            <Plus className="w-4 h-4 mr-1" />
            Ny
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  activeFilter === f.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                )}
              >
                {f.label}
                <span className="ml-1.5 text-xs opacity-70">{stats[f.key] || 0}</span>
              </button>
            ))}
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-secondary p-4 mb-4">
              <ListTodo className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="font-medium">
              {search.trim() ? "Inga träffar" : "Inga uppgifter"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {search.trim()
                ? "Prova ett annat sökord."
                : activeFilter === "all"
                ? "Lägg till din första uppgift för att komma igång."
                : "Inget i den här vyn."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={handleToggle}
                onEdit={handleEdit}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Redigera uppgift" : "Ny uppgift"}</DialogTitle>
            <DialogDescription>
              {editing ? "Uppdatera detaljerna nedan." : "Fyll i detaljerna för din uppgift."}
            </DialogDescription>
          </DialogHeader>
          <TaskForm
            initialTask={editing}
            onSubmit={handleSubmit}
            onCancel={() => { setFormOpen(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort uppgift?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `“${deleting.title}” raderas permanent.` : "Uppgiften raderas permanent."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}