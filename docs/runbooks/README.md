# Runbooks

One file per alert from `docs/monitoring.md`. Each follows:

```
## Symptom
## Impact
## Diagnosis
## Immediate mitigation
## Root cause investigation
## Long-term fix
```

Runbooks must be resolvable with commands available inside a paged
on-call's laptop + production kubeconfig. Avoid assuming deep context.
