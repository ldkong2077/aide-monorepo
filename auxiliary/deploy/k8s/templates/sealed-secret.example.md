# Secret materialisation options

The AIDE k8s templates ship a placeholder `Secret` file
(`30-secret.yaml.example`) for documentation. **Do not commit the
real secret** — pick one of the three flows below to materialise
`aide-secrets` in the cluster.

## Why a Secret at all?

AIDE needs at least:

- `AIDE_TOKEN` — Bearer token clients must present for any
  endpoint other than `/health`, `/readyz`, `/metrics`.
- One of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`
  for the upstream LLM provider.

These are sensitive. The k8s Secret is base64-encoded at rest but
**not encrypted** unless you enable etcd encryption at the cluster
level. The three options below let you keep the plaintext outside
git entirely.

---

## Option A: raw `kubectl create` (acceptable for dev)

```bash
kubectl -n aide create secret generic aide-secrets \
  --from-literal=AIDE_TOKEN=$(openssl rand -hex 32) \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY"
```

Pros: zero infrastructure. Cons: the secret lives only in your
shell history and in etcd.

---

## Option B: sealed-secrets (git-friendly, single-cluster)

Sealed-secrets is a controller that encrypts a `Secret` client-side
with a cluster-scoped key. The encrypted blob is safe to commit.

```bash
# 1. Install the controller (once per cluster).
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# 2. Write the plaintext manifest (DO NOT COMMIT).
cat > aide-secrets.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: aide-secrets
  namespace: aide
type: Opaque
stringData:
  AIDE_TOKEN: $(openssl rand -hex 32)
  OPENAI_API_KEY: $OPENAI_API_KEY
EOF

# 3. Encrypt it.
kubeseal --format yaml < aide-secrets.yaml > 30-secret.sealed.yaml

# 4. Add 30-secret.sealed.yaml to kustomization.yaml's `resources:`.
#    Commit and push.
```

The controller decrypts on apply. Rotate by repeating the flow.

---

## Option C: external-secrets-operator (recommended for prod)

ESO pulls secrets from an external vault on a schedule and
materialises them as native k8s `Secret` objects. Supported backends
include HashiCorp Vault, AWS Secrets Manager, AWS SSM Parameter
Store, GCP Secret Manager, Azure Key Vault, and many more.

```yaml
# components/external-secrets/aide.yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-parameter-store
  namespace: aide
spec:
  provider:
    aws:
      service: ParameterStore
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: aide
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: aide
  namespace: aide
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-parameter-store
    kind: SecretStore
  target:
    name: aide-secrets
    creationPolicy: Owner
  data:
    - secretKey: AIDE_TOKEN
      remoteRef:
        key: /aide/prod/AIDE_TOKEN
    - secretKey: OPENAI_API_KEY
      remoteRef:
        key: /aide/prod/OPENAI_API_KEY
```

The IRSA / Workload Identity binding on the `aide` ServiceAccount
controls who can read those parameter paths.

---

## Verifying the materialised Secret

```bash
kubectl -n aide get secret aide-secrets -o jsonpath='{.data.AIDE_TOKEN}' \
  | base64 -d | head -c 8 ; echo
# should print 16 hex characters
```

The pod will start picking up the values on its next restart; a
`ConfigMap` or `Secret` change does not automatically trigger a
rolling restart, so:

```bash
kubectl -n aide rollout restart deploy/aide
```
