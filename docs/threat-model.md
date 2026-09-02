# Threat model

## What this is

`bare-module` is compiled into Bare. It is listed in `src/builtins.json`, so every Bare process has it. That holds whether or not the process sealed, and no code has to load anything to reach it.

So this addon is part of Bare, and [Bare's threat model](https://github.com/holepunchto/bare/blob/main/docs/threat-model.md) covers it. Read that one first. This one only says where this addon sits in it.

## What it inherits

- **The promise.** Bare promises a sealed process gets no new native code. This addon is native code that is already in, so the seal neither adds it nor takes it away.
- **The attacker.** Untrusted JavaScript in a sealed process. It writes what it likes, runs on as many threads as it wants, and calls anything it can reach in any order and all at once. It can reach all of this addon.
- **The trust.** This addon is trusted, because Bare compiles it in. Whatever you compile in is your security policy, and this is one of the things you picked.
- **The walls.** The same table applies. A thread is not a wall and neither is a realm, so nothing here gets to assume it is alone.
- **The rules.** What Bare says to report, and what Bare says is not a bug, is the same here.

## What counts

- **Counts:** `binding.c` and the JavaScript that ships with it. Sealed JavaScript reaches all of it without loading a thing.
- **Does not count:** tests, benchmarks, and scratch code.

## What this addon adds

The module system. It resolves, links and evaluates, it reads `package.json`, and it makes module records through the engine.

Two things from Bare's document live here.

**The protocol rule.** A module graph reaches as far as the protocol it was handed and no further. This addon is what holds that up. It reaches no store on its own, and every read goes through a protocol the embedder gave it, which is why code loaded without one reads nothing.

**The one power.** Addon specifiers are resolved here, and the addon is loaded through `Bare.Addon`. So this addon is the thing that asks for the one power Bare hands out. It does not decide the answer. The seal does.

## Where the risk is

This is the widest surface of the builtins, and it sits on two of Bare's four remaining worries at once.

It resolves, parses and links code it may not trust, which Bare names as a risky spot. And a bug here does not have to be a memory bug to matter. The plumbing carries protocols around, so a graph that ends up with a protocol it was not given reads whatever that protocol reads. That is a whole store rather than a byte, and it is what the protocol rule is there to stop.

## What to report

- Any way for a module graph to end up with a protocol it was not handed
- Any way for a specifier to resolve to something the protocol should not reach
- Any addon load that gets to `Bare.Addon` when the seal should have stopped it
- Memory bugs in `binding.c` that JavaScript can reach
- Anything on Bare's report list

Not a bug: that a graph reaches everything its protocol reaches. Picking the protocol is the embedder's job, and Bare says to pass a restricted one when the code is untrusted.
