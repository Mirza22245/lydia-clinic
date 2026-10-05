import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ScheduleTab from "@/components/schedule/ScheduleTab";
import TimeOffTab from "@/components/schedule/TimeOffTab";
import RoomsTab from "@/components/schedule/RoomsTab";
import ResourcesTab from "@/components/schedule/ResourcesTab";
import WaitingListTab from "@/components/schedule/WaitingListTab";

export default function Schedule() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-heading">Schema & Resurser</h1>
        <p className="text-sm text-muted-foreground">Hantera arbetsscheman, frånvaro, rum, resurser och väntelista.</p>
      </div>
      <Tabs defaultValue="schedule">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="schedule">Arbetsschema</TabsTrigger>
          <TabsTrigger value="timeoff">Frånvaro</TabsTrigger>
          <TabsTrigger value="rooms">Rum</TabsTrigger>
          <TabsTrigger value="resources">Resurser</TabsTrigger>
          <TabsTrigger value="waiting">Väntelista</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule" className="mt-4"><ScheduleTab /></TabsContent>
        <TabsContent value="timeoff" className="mt-4"><TimeOffTab /></TabsContent>
        <TabsContent value="rooms" className="mt-4"><RoomsTab /></TabsContent>
        <TabsContent value="resources" className="mt-4"><ResourcesTab /></TabsContent>
        <TabsContent value="waiting" className="mt-4"><WaitingListTab /></TabsContent>
      </Tabs>
    </div>
  );
}