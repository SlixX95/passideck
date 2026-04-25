# Rumen — the part of your memory that keeps processing after you stop working

**Target publication:** dev.to + Hashnode, 1 week after the TermDeck Show HN.
**Length:** ~830 words.
**Audience:** developers who have already adopted a persistent-memory tool (Mnestra, Mem0, Letta, Zep, Chroma, any of the 138 Engrams) and wonder what the next useful thing to build on top of it is.
**Hero image:** none required — opens with a cow metaphor that reads better as text.

---

If you want to understand why I built Rumen, picture a cow.

A cow has four stomach chambers. The first one, the rumen, is where partially chewed food sits while microbes break it down. The cow eats, stops eating, and then — for hours afterward — the rumen keeps working. The cow's awareness of the grass is over. The processing of the grass has only just begun. When the cow regurgitates the partly-fermented mass (cud) later, it's not the same grass that went in. It's grass that has been turned over and over in a place the cow wasn't paying attention to, and it comes back up more usable than it went down.

That's the metaphor. Your memory store is the same.

Most AI memory products for developers — Mem0, Letta, Zep, Mnestra, the 138 Engrams — are passive. You write a memory. It sits in a vector database. You query it later. Between the write and the query, nothing happens. The store is inert.

**Rumen is what happens between the write and the query.** It's an async learning layer that runs on top of any pgvector memory store, and every fifteen minutes it reads new memories, finds patterns across them, synthesizes insights, and writes those insights back into the same store. The LLM is stateless. Rumen isn't.

## The problem with passive stores

Suppose you solved a Postgres foreign-key problem in project A on Monday. You wrote a memory: *"FK constraint failed because the referenced unique index didn't exist yet; split the migration into two."* Good memory.

Tuesday you hit a different error in project B. Same underlying cause: transaction ordering against a deferred unique index. The shape is similar but not identical. Your query for "FK constraint" might surface the Monday memory — depends on the embedding. Your query for "transaction order deferred index" probably won't — Monday's memory doesn't use those words.

What you actually want is for the memory store to **notice** the similarity between Monday's fix and Tuesday's error on its own, write a new insight that generalizes both of them (*"transaction ordering against deferred unique indexes is a recurring migration failure mode; the fix is always to split the migration"*), and have *that* insight surface on Wednesday when you hit the same shape again in project C.

The passive store can't do that. It doesn't read itself. It doesn't cross-reference. It doesn't generalize. It just stores.

Rumen does the three things a passive store can't: **extract, relate, synthesize.**

## Extract → Relate → Synthesize

The Rumen loop runs every fifteen minutes (configurable). Each run:

1. **Extract.** Pull memories written since the last run. Tag each one with its `source_type` (bug_fix, decision, architecture, fact, preference, code_context) and its `project`. Write a small "extract" record to `rumen_jobs` for audit.

2. **Relate.** For each new memory, compute vector similarity against the whole existing memory store. Cluster matches above the similarity threshold. The output of this phase is a set of "candidate insight clusters" — groups of memories that talk about the same shape of problem or decision.

3. **Synthesize.** Feed each candidate cluster to Claude Haiku with a structured prompt that asks: *"what's the general pattern these memories point at, and what's the actionable lesson?"* Haiku returns a short insight text. Write it back to the store as a memory of `source_type: insight`, with citation IDs pointing at the source memories it was derived from.

The next time you query the memory store, the insights surface alongside the raw memories. Because insights are source-typed differently, they can be weighted differently in the retrieval ranking — you probably want insights to rank higher than raw memories when both are relevant, because the insight is the already-generalized form.

## Cost guardrails, because Haiku is not free

Running Haiku every fifteen minutes on a growing memory store is a real cost. Not a huge one — Haiku is cheap — but a real one that will drift up as the store grows if you're not careful. Rumen has three guardrails:

1. **Per-job budget cap.** Each Rumen job has a max-tokens budget. If the Synthesize phase tries to exceed it, the job finishes early and writes a partial insight batch. Default cap is tuned for a solo developer's scale — ~500K input tokens per day.
2. **Cluster size caps.** Large clusters (>20 memories) get truncated before Synthesize. The cost of synthesizing a 100-memory cluster is way out of proportion to the quality gain.
3. **Cooldown on repeated insights.** If Rumen already wrote an insight about a cluster, it doesn't re-synthesize a fresh one unless the cluster has grown materially since the last pass. Tracked via the `rumen_insights.source_ids` array.

The effective cost on my own 3,451-memory store running every 15 minutes is about **$0.30–$1.00 per month** depending on how much I write. For comparison, the embedding cost (OpenAI `text-embedding-3-large` at Mnestra's write path) is around **$0.50 per month** on the same store. Rumen roughly doubles the monthly bill but is the single highest-value use of those dollars — it's the only reason the store gets smarter over time.

## Deployment model

Rumen ships as a Supabase Edge Function. The install path is:

1. `termdeck init --rumen` (or `mnestra init --rumen` if you're running Mnestra standalone).
2. The wizard: checks for the Supabase CLI and Deno, derives the project ref from your Mnestra config, runs `supabase link`, applies the Rumen tables migration via `psql`, deploys the `rumen-tick` edge function, sets the function's secrets, runs one manual test POST, and applies the `pg_cron` schedule SQL.
3. After that, the function runs every 15 minutes automatically. You can monitor it via `select * from rumen_jobs order by started_at desc` in the Supabase SQL editor.

The Edge Function model is specifically valuable because it means Rumen **doesn't need a server** of its own. It runs on Supabase's infrastructure, on a schedule, and it reads and writes the same Postgres database the rest of your stack is already using. No new moving parts.

## What Rumen v0.5 will add: question generation

Right now (rumen@0.4.5) Rumen only generates insights in response to observed memories. A v0.5 path will add **question generation**: Rumen will occasionally write a memory of `source_type: question` — an open question it noticed across the store that it can't answer on its own. Those questions show up in TermDeck's Flashback surface so the next time you're in a related context, you see the question and can answer it (or decide it's not worth answering). The loop becomes: write → relate → synthesize → question → surface → answer → write. Not shipped yet; roadmap item.

The goal is a memory store that gets more useful the longer you run it. Not just more populated — actually smarter. That's why I called it Rumen. The chewing happens when you're not looking.

## Install

```
npx @jhizzard/termdeck
termdeck init --mnestra   # Tier 2: Mnestra memory + Flashback
termdeck init --rumen     # Tier 3: Rumen async learning
```

Or standalone if you don't want TermDeck:

```
npm install -g @jhizzard/mnestra
mnestra init
mnestra init --rumen
```

GitHub: https://github.com/jhizzard/rumen
Docs: https://termdeck-docs.vercel.app/rumen/

TermDeck (the browser multiplexer) is at https://github.com/jhizzard/termdeck and Mnestra (the memory layer Rumen runs on top of) is at https://github.com/jhizzard/mnestra. All three are MIT.

---

**Word count:** 831 (target 800).

**End of blog-post-rumen.md.**
