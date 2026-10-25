import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkspace } from "@/lib/dal";
import { ActivityFeed, BriefBody, BriefSwitcher, UpdateNowButton, WatchSettingsForm } from "./competitor-ui";
import { activityViews, aiBlocked, briefsView, watchSettingsView } from "./competitor-views";

/**
 * Intel → Following (ARCHITECTURE.md section 3, "Competitor watch"): the daily, weekly, monthly and
 * yearly briefs, what the followed competitors, people and pages did across competitors, and how
 * often it all runs with what it costs.
 */
export async function FollowingSection({
  productId,
  competitors,
  briefRunning,
  asked,
}: {
  productId: string;
  competitors: { id: string; name: string; followed: number }[];
  briefRunning: boolean;
  asked: { brief?: string; briefId?: string; relevant?: boolean };
}) {
  const workspace = await getWorkspace();
  const [activity, briefs, settings, blocked] = await Promise.all([
    activityViews(productId, undefined, 100, asked.relevant),
    briefsView(productId, { period: asked.brief, id: asked.briefId }),
    watchSettingsView(workspace.id, productId),
    aiBlocked(),
  ]);
  const unseen = activity.filter((a) => !a.seen).length;
  const following = competitors.filter((c) => c.followed > 0);
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Briefs</CardTitle>
          <CardDescription>
            The AI reads what you follow (posts, page changes, and what changed in researched profiles) and says what matters for your product. The current brief is updated as new things arrive; longer ones are written from the shorter ones.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {briefs.periods.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every brief is switched off. Switch one on under Settings below.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <BriefSwitcher periods={briefs.periods} active={briefs.period} />
                <UpdateNowButton productId={productId} period={briefs.period} working={briefRunning} why={blocked} />
              </div>
              {briefs.brief ? <BriefBody brief={briefs.brief} /> : <p className="text-sm text-muted-foreground">No brief for this period yet. One is written after the next read that finds something.</p>}
              {briefs.past.length > 0 && (
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Earlier:</span>
                  {briefs.past.map((b) => (
                    <Link key={b.id} href={`/intel?tab=following&brief=${briefs.period}&briefId=${b.id}`} scroll={false} className="underline-offset-4 hover:underline">
                      {b.title}
                    </Link>
                  ))}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>
            {following.length
              ? `From ${following.map((c) => c.name).join(", ")}: their accounts, blogs, watched pages and the people you follow there.`
              : "Follow a competitor's accounts, blog, pages or people from its page."}
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            {unseen > 0 && <Badge>{unseen} new</Badge>}
            <Link href={asked.relevant ? "/intel?tab=following" : "/intel?tab=following&relevant=1"} scroll={false} className="text-xs underline-offset-4 hover:underline">
              {asked.relevant ? "Show everything" : "Only what matters"}
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ActivityFeed productId={productId} items={activity} showCompetitor />
          {competitors.length > 0 && (
            <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">Competitors:</span>
              {competitors.map((c) => (
                <Link key={c.id} href={`/intel/competitors/${c.id}`} className="underline-offset-4 hover:underline">
                  {c.name}
                  {c.followed > 0 && <span className="text-muted-foreground"> ({c.followed} followed)</span>}
                </Link>
              ))}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Which briefs to write, how often Startica reads what you follow, and how often it researches each competitor again.</CardDescription>
        </CardHeader>
        <CardContent>
          <WatchSettingsForm productId={productId} view={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
