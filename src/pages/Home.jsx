import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Plus, ListTodo, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import TaskForm from "@/components/tasks/TaskForm";
import TaskItem from "@/components/tasks/TaskItem";

const filters = [
  { key: "all", label: "Alla" },
  { key: "todo", label: "Att göra" },
  { key: "in_progress", label: "Pågår" },
  { key: "done", label: "Klart" },
];

export default function Home() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const query = activeFilter === "all" ? {} : { status: activeFilter };
      const page = await base44.entities.Task.filter(query, {
        sort: "-created_date",
        limit: 50,
      });
      setTasks(page.items || []);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

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
    await loadTasks();
  };

  const handleToggle = async (task) => {
    const next = task.status === "done" ? "todo" : "done";
    await base44.entities.Task.update(task.id, { status: next });
    await loadTasks();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await base44.entities.Task.delete(deleting.id);
    setDeleting(null);
    await loadTasks();
  };

  const counts = tasks.reduce(
    (acc, t) => {
      acc.all += 1;
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    { all: 0, todo: 0, in_progress: 0, done: 0 }
  );

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

        <div className="flex items-center justify-between gap-3 mb-5">
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
                <span className="ml-1.5 text-xs opacity-70">{counts[f.key] || 0}</span>
              </button>
            ))}
          </div>
          <Button onClick={handleCreate} size="sm" className="shrink-0">
            <Plus className="w-4 h-4 mr-1" />
            Ny
          </Button>
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
            <p className="font-medium">Inga uppgifter</p>
            <p className="text-sm text-muted-foreground mt-1">
              {activeFilter === "all"
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
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}