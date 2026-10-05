import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const empty = { title: "", description: "", status: "todo", priority: "medium", due_date: "" };

export default function TaskForm({ initialTask, onSubmit, onCancel }) {
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialTask) {
      setForm({
        title: initialTask.title || "",
        description: initialTask.description || "",
        status: initialTask.status || "todo",
        priority: initialTask.priority || "medium",
        due_date: initialTask.due_date || "",
      });
    }
  }, [initialTask]);

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        due_date: form.due_date || undefined,
        description: form.description || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Titel</Label>
        <Input
          id="title"
          value={form.title}
          onChange={(e) => set("title")(e.target.value)}
          placeholder="Vad ska göras?"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Beskrivning</Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(e) => set("description")(e.target.value)}
          placeholder="Valfria detaljer"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={set("status")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">Att göra</SelectItem>
              <SelectItem value="in_progress">Pågår</SelectItem>
              <SelectItem value="done">Klart</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Prioritet</Label>
          <Select value={form.priority} onValueChange={set("priority")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Låg</SelectItem>
              <SelectItem value="medium">Medel</SelectItem>
              <SelectItem value="high">Hög</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="due_date">Förfallodatum</Label>
        <Input
          id="due_date"
          type="date"
          value={form.due_date}
          onChange={(e) => set("due_date")(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Avbryt
        </Button>
        <Button type="submit" disabled={submitting || !form.title.trim()}>
          {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {initialTask ? "Spara" : "Lägg till"}
        </Button>
      </div>
    </form>
  );
}