# Deploying AIDE on Kubernetes

This directory contains kustomize templates for running the AIDE
proxy on a Kubernetes cluster. The default setup targets a single
cluster, single namespace, behind an nginx Ingress Controller and
scrapeable by Prometheus Operator.

## Quick start

```bash
# 1. Materialise the secrets. Pick ONE of the three options below.

# 2. Apply.
kubectl apply -k deploy/k8s/templates/

# 3. Wait for ready.
kubectl -n aide rollout status deploy/aide --timeout=5m

# 4. Smoke-test.
kubectl -n aide port-forward svc/aide 9900:9900 &
curl -fsS http://localhost:9900/health
curl -fsS http://localhost:9900/readyz
curl -fsS http://localhost:9900/metrics | head -20
```

The proxy listens on port 9900 inside the pod; the Service and
Ingress forward the same port.

## Image

`kustomization.yaml` pins the image to `ghcr.io/aide-dev/aide:1.0.0`.
Override with kustomize:

```bash
cd deploy/k8s/templates
kustomize edit set image \
  ghcr.io/aide-dev/aide=ghcr.io/aide-dev/aide:v1.2.3
kubectl apply -k .
```

The release workflow at `.github/workflows/release.yml` pushes
multi-arch (linux/amd64 + linux/arm64) images to `ghcr.io/aide-dev/`
on every `v*.*.*` tag.

## Probes

| Probe | Endpoint | Purpose |
|---|---|---|
| `startupProbe` | `/readyz` | Gives the process up to 5 min to become ready on first boot |
| `livenessProbe` | `/health` | Kills the pod if it is hung (always 200 if the process is up) |
| `readinessProbe` | `/readyz` | Removes the pod from Service endpoints during startup / shutdown |

`/readyz` returns **503** while the process is starting up or
shutting down, **200** otherwise. The pod is kept in the Service
endpoints only when ready.

## Resource sizing

The default requests/limits in `40-deployment.yaml` are sized for a
proxy serving a small team (~10 concurrent chat completions):

| Resource | Request | Limit |
|---|---|---|
| CPU | 100m | 1000m |
| Memory | 256Mi | 1Gi |

Tune via a kustomize patch:

```yaml
# overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../templates
patches:
  - target:
      kind: Deployment
      name: aide
    patch: |
      - op: replace
        path: /spec/template/spec/containers/0/resources/limits
        value:
          memory: 4Gi
          cpu: 4000m
```

## Secrets

The template does **not** include a live `Secret` — the file
`30-secret.yaml.example` is documentation. Pick one of three flows:

### Option A: raw `kubectl create` (dev only)

```bash
kubectl create namespace aide
kubectl -n aide create secret generic aide-secrets \
  --from-literal=AIDE_TOKEN=$(openssl rand -hex 32) \
  --from-literal=OPENAI_API_KEY=$OPENAI_API_KEY
```

### Option B: sealed-secrets

```bash
# 1. Install the controller once per cluster.
helm install sealed-secrets sealed-secrets/sealed-secrets

# 2. Encrypt a manifest locally.
kubeseal --format yaml < 30-secret.yaml > 30-secret.sealed.yaml

# 3. Commit 30-secret.sealed.yaml and add it to the kustomization's
#    `resources:` list. Safe to commit because it is encrypted.
```

### Option C: external-secrets-operator (recommended for prod)

```yaml
# See components/external-secrets/aide.yaml — pull from your vault
# (Vault, AWS Secrets Manager, GCP Secret Manager, etc.) and let ESO
# materialise the Secret on a schedule.
```

## TLS

The Ingress expects a TLS Secret named `aide-tls`. The default
annotation uses cert-manager with the `letsencrypt-prod` issuer;
remove the annotation if you are using a different cert source.

```bash
# 1. Install cert-manager once per cluster.
helm install cert-manager jetstack/cert-manager \
  --set installCRDs=true

# 2. Define a ClusterIssuer (apply once, cluster-scoped).
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF

# 3. Apply the templates — cert-manager will provision the cert.
kubectl apply -k deploy/k8s/templates/
```

## Monitoring

`90-servicemonitor.yaml` exposes `/metrics` to a Prometheus Operator
deployment labelled `release: prometheus`. Useful PromQL to start
with:

```promql
# Request rate per provider
sum by (provider) (rate(aide_upstream_requests_total[5m]))

# p95 upstream latency
histogram_quantile(0.95,
  sum by (le, provider) (rate(aide_upstream_request_duration_seconds_bucket[5m]))
)

# Error rate
sum by (outcome) (rate(aide_upstream_requests_total{outcome!="success"}[5m]))

# 429 (rate-limited) rate
sum(rate(aide_rate_limit_rejections_total[5m]))

# Pod count vs requests
sum(kube_pod_info{pod=~"aide-.*"})
  / sum(rate(aide_http_requests_total[1m]))
```

## Pod Security Standards

The namespace is labelled `restricted`. Any workload deployed
without `runAsNonRoot`, `readOnlyRootFilesystem`, and dropped
capabilities will be rejected. Do not weaken this label.

## Scaling

The HPA scales between 2 and 10 replicas on CPU (>70%) and memory
(>80%). For latency-driven autoscaling, install KEDA and create a
`ScaledObject` keyed on `aide_http_requests_in_flight`.

## Upgrades

```bash
# 1. Bump the image tag.
cd deploy/k8s/templates
kustomize edit set image ghcr.io/aide-dev/aide:ghcr.io/aide-dev/aide:v1.2.3

# 2. Diff before applying.
kubectl diff -k .

# 3. Apply. The Deployment uses RollingUpdate with maxSurge: 1
#    maxUnavailable: 0, so the old version stays up until the new
#    one passes readiness.
kubectl apply -k .
```
