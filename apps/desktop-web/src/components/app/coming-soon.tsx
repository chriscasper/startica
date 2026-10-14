import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** A placeholder for a screen not built yet: with its planned phase, or just "Coming soon". */
export function ComingSoon({ phase, title, points }: { phase?: string; title: string; points: string[] }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant="secondary">{phase ? `Phase ${phase}` : "Coming soon"}</Badge>
        </div>
        <CardDescription>Not built yet.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
