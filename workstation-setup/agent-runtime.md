## Models

You essentially have two options right now:

1. Use a local Model (Qwen, Gemma, Llama, etc.)
2. Go with a provider like OpenAI, Anthropic, Grok, Gemini, etc.

I personally have been bouncing around the idea for quite a while now to switch completely to number 1. Buy a DGX Spark, bring down a Qwen or Gemma Model, fine-tune it in a specific way to make it "my own", and just use that.

Here's the reality that I have found, however... the majority of the Models are "pretty good at doing what you need them to do". Pick a Model that you like/feel comfy with and roll with it. What differentiates Agent workflows right now isn't as much the Model as it is the Agent Harness.

Because of that, I would say pick a Model or two that you, personally, get the best results from.

For me, I use Opus 4.6/4.7 and GPT 5.5.

Typically, I use Opus 4.6/4.7 to create a new project/step-by-step guide/demo and then I have GPT 5.5 look it over and test it.

Opus/Claude Models are great for spinning up new things and GPT 5.5 is awesome for troubleshooting and diving deep (in my opnion, as of May 2026)

## Platform/Developer Tool

The client you use can matter almost more than the LLM. For example, it's no secret that Claude Code was having some major issues for about a month. However, that doesn't open Opus 4.6 was having a ton of issues. If you used Opus with, for example opencode at the time that Claude Code was having issues, you could still get really good results.

That's why choosing which tool you use is drastically important.

I was a HUGE Claude Code fan. There were maybe 6-7 months where I didn't even bother trying anything else because there was no point. Now? I'm testing out getting Claude Code back into my daily workflow, but for me it's a lot of opencode and Codex.

I bounce between opencode and Codex depending on where I start out. If I'm using just OpenAI Models, I'll typically just start with Codex. If I'm bouncing between both, I'll use opencode. Opencode is great, but of course with Codex and OpenCode, there are quite a few more features like `/remote` and integrations with GitHub and such. Choose based on what you actually need to get done based on what you're working on