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
Download `prometheus-isms.yml` and `prometheus-alerts.yml` from administration.
Mount the latter at `/etc/prometheus/isms-alerts.yml` and check both with
`promtool check config` / `promtool check rules` before reload. Confirm the
`isms-api` target is UP and the dependency/storage gauges contain values.

## Syslog

Apply `deploy/compose/observability-syslog.yml` as a Compose overlay so only the
portal services use the remote driver; do not change Docker's global driver.
Set `SYSLOG_ADDRESS` to a private `tcp+tls://host:6514` collector and configure
the Docker TLS certificate options on the host. The dual-logging cache keeps a
bounded local copy. Copy `rsyslog-isms.conf.example` to the collector and
replace its placeholders. Never place keys or shared secrets in source control.
The overlay requires `SYSLOG_TLS_CA_CERT`, `SYSLOG_TLS_CERT`, and
`SYSLOG_TLS_KEY`: these are paths readable by the Docker daemon, not paths
inside containers. Use `tcp+tls://collector:6514`; verification stays enabled.
Validate the receiver with `rsyslogd -N1` before activation. It writes only
JSON payloads, without syslog headers, to `/var/log/isms-portal/events.json`.
Grant the Wazuh agent read access and configure log rotation on the collector.
Do not activate the overlay until the TLS listener and certificates are ready:
an unavailable logging driver can prevent container startup.

## Wazuh

Import `wazuh-isms-rules.xml` into the Wazuh manager local rules directory.
Prefer configuring the Wazuh agent `<localfile>` input on the normalized rsyslog
destination, with `<log_format>json</log_format>`. Direct access to Docker's
container storage requires elevated permissions and is only a fallback. The API
emits sanitized `event=audit` JSON records; database audit details are excluded.
Download the rules, agent input, and synthetic JSONL events separately.
Check that IDs 110100-110105 are unused before importing. Run the samples
through `/var/ossec/bin/wazuh-logtest`; expected rules include 110101 (503),
110102 (403), 110103 (denied audit), and 110104 (notification failure).
Use the collector agent to confirm a real event reaches the Wazuh dashboard.

## Zabbix

Import `zabbix-isms-template.yaml` and attach it to a host representing the
portal. Set the `{$ISMS.URL}` macro to a private or authenticated monitoring
URL. Set `{$ISMS.METRICS.URL}` to `http://api:3001/metrics` only when the Zabbix
proxy/server is attached to the private application network. The public reverse
proxy must continue returning 404 for `/metrics`.
The download is an actual Zabbix 7.0 template, not a macros-only text file.
It includes HTTP readiness, a single private metrics master item, dependent
items and triggers for dependencies, storage, directory failures and queue
failures. Adjust `{$ISMS.STORAGE.MIN.BYTES}` for the deployment capacity.
Confirm import and item values in Latest data on your Zabbix version before
enabling notifications. The API preparation test probes local dependencies,
metrics and packaged files; it cannot prove access from Zabbix or Wazuh.

Certificate paths, credentials and tokens belong in the infrastructure secret
manager and are intentionally represented by placeholders in these examples.
