import Link from "next/link";
import { weeklyDigest } from "@startica/core/competitors/activity";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityFeed, DigestBody, DigestControls } from "./competitor-ui";
import { activityViews, aiBlocked, digestView } from "./competitor-views";

/**
 * Intel → Following (ARCHITECTURE.md section 3, "Competitor watch"): the AI digest of the week and
 * everything the followed competitors and people posted, across competitors.
 */
export async function FollowingSection({ productId, competitors, digestRunning }: { productId: string; competitors: { id: string; name: string; followed: number }[]; digestRunning: boolean }) {
  const [activity, digest, weekly, blocked] = await Promise.all([activityViews(productId, undefined, 100), digestView(productId), weeklyDigest(productId), aiBlocked()]);
  const unseen = activity.filter((a) => !a.seen).length;
  const following = competitors.filter((c) => c.followed > 0);
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>This week&apos;s digest</CardTitle>
          <CardDescription>The AI reads the last 7 days of posts from what you follow, and what changed in researched profiles, and says what matters for your product. A few cents a run.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DigestControls productId={productId} weekly={weekly} working={digestRunning || digest?.status === "working"} why={blocked} />
          {digest ? <DigestBody digest={digest} /> : <p className="text-sm text-muted-foreground">No digest yet.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>
            {following.length
              ? `From ${following.map((c) => c.name).join(", ")}: their accounts, blogs and the people you follow there. Read every morning at 05:23 while Startica is open.`
              : "Follow a competitor's accounts or blog, or people at it, from its page."}
          </CardDescription>
          {unseen > 0 && (
            <CardAction>
              <Badge>{unseen} new</Badge>
            </CardAction>
          )}
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
    </div>
  );
}
