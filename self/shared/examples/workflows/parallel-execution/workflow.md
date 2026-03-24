---
name: parallel-execution
description: Fan-out and fan-in workflow package with a bound reporting template.
entrypoint: start-trigger
entrypoints:
  - start-trigger
---

# Parallel Execution

This example shows a workflow that fans out from one trigger into multiple
parallel agent nodes, then joins the results before producing a templated
reporting step.
