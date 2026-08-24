# ISMS Portal observability integrations

These examples keep application metrics on the private Docker or Kubernetes
network. Do not publish the API `/metrics` route through the reverse proxy.
The API also joins the non-internal `isms-portal_observability` Docker network. An
authorized collector can join that named network without publishing an API
port on the host. Compose prefixes the name with the project name, keeping test
and production stacks isolated; inspect it with `docker network ls` if the
Compose project name was customized.

## Prometheus and Grafana

Scrape `http://api:3001/metrics` from a collector attached to the private
application network. Load `prometheus-alerts.yml` as a Prometheus rule file.
Grafana can then use Prometheus as its data source.

## Syslog

Apply `deploy/compose/observability-syslog.yml` as a Compose overlay so only the
portal services use the remote driver; do not change Docker's global driver.
Set `SYSLOG_ADDRESS` to a private `tcp+tls://host:6514` collector and configure
the Docker TLS certificate options on the host. The dual-logging cache keeps a
bounded local copy. Copy `rsyslog-isms.conf.example` to the collector and
replace its placeholders. Never place keys or shared secrets in source control.

## Wazuh

Import `wazuh-isms-rules.xml` into the Wazuh manager local rules directory.
Prefer configuring the Wazuh agent `<localfile>` input on the normalized rsyslog
destination, with `<log_format>json</log_format>`. Direct access to Docker's
container storage requires elevated permissions and is only a fallback. The API
emits sanitized `event=audit` JSON records; database audit details are excluded.

## Zabbix

Import `zabbix-isms-template.yaml` and attach it to a host representing the
portal. Set the `{$ISMS.URL}` macro to a private or authenticated monitoring
URL. Set `{$ISMS.METRICS.URL}` to `http://api:3001/metrics` only when the Zabbix
proxy/server is attached to the private application network. The public reverse
proxy must continue returning 404 for `/metrics`.

Certificate paths, credentials and tokens belong in the infrastructure secret
manager and are intentionally represented by placeholders in these examples.
