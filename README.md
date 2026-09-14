# suqo-claude-plugins

Claude Code plugin that ships skills for building apps on top of the **SUQO SDKs**.

## What this is

This repo is a Claude Code plugin (and its own marketplace source), so it can be installed with:

```
/plugin marketplace add suqo-ai/suqo-claude-plugins
/plugin install suqo-claude-plugins
```

Once installed, Claude loads the relevant skill on its own when a developer asks for SUQO work — no explicit invocation needed, though `/php-sdk-usage` and friends still work.

## Skills

| Skill | Triggers on |
|---|---|
| `php-sdk-usage` | Any PHP work with the SUQO PHP SDK — products, subscriptions, paging, webhook verification, client wiring, error handling, testing. |
| `ts-sdk-usage` | Any TypeScript/Node work with the SUQO TS SDK (`@suqo/sdk`) — products, customers, subscriptions, resuming/cancelling, paging, webhook verification (Express, Fastify, Next.js, plain Node), client wiring, error handling, testing. |

Each skill is self-contained: `SKILL.md` carries the workflow and the rules that
are easy to get wrong, `references/` holds the detail Claude loads only when the
task needs it, and `templates/` holds code to adapt rather than write from
scratch.

One skill per SDK, deliberately. Splitting PHP into separate usage/webhook/test
skills meant three overlapping `description` fields competing to be selected;
one skill with a chunked `references/` folder picks itself reliably and still
loads only the page a task needs.

## Structure

```
suqo-claude-plugins/
  .claude-plugin/
    plugin.json           # plugin metadata
    marketplace.json      # marketplace source definition
  skills/
    php-sdk-usage/
      SKILL.md
      references/         # api-surface, client-setup, subscriptions, products,
                          #   webhooks, errors, models
      templates/          # client factory, list, create, Laravel provider,
                          #   webhook handlers (plain PHP, Laravel, Symfony, PSR-15)
    ts-sdk-usage/
      SKILL.md
      references/         # api-surface, client-setup, products, subscriptions,
                          #   customers, webhooks, errors, models, pagination
      templates/          # client factory, list-products (+ paged variant),
                          #   list-customers, shared error ladder,
                          #   create-subscription, manage-subscription,
                          #   a write test, webhook handlers (plain Node,
                          #   Express, Fastify, Next.js)
  README.md
```

## Adding more skills

Add new skills under `skills/<skill-name>/SKILL.md` following the same pattern. Keep this repo as the single place we ship all SUQO Claude skills from — don't spin up separate plugin repos per skill.

Conventions worth keeping:

- `name` in the frontmatter matches the directory name, lowercase and hyphenated.
- `description` says *when* to use the skill and names the trigger phrases a
  developer would actually type — that text is all Claude sees when deciding
  whether to load it.
- Keep `SKILL.md` short enough to hold in context. Push detail into
  `references/`, one file per topic, and index them in a table.
- Templates are real, runnable files, not sketches. Lint them (`php -l`) and,
  where they are tests, run them.
- State the API surface exactly and tell Claude not to invent methods. The PHP
  skills' `references/api-surface.md` exists for that reason.

