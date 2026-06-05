# Convenience targets wrapping the install/uninstall scripts and
# systemctl. Run `sudo make <target>`.

PREFIX  ?= /usr/local
VERSION ?=

.PHONY: help install uninstall status logs restart stop start upgrade nginx-test

help:                          ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install:                       ## Install the service, user, dirs, and binary
	./install.sh

uninstall:                     ## Remove the service (preserves data)
	./uninstall.sh

status:                        ## Show the systemd service status
	systemctl status aide --no-pager

logs:                          ## Follow the service logs
	journalctl -u aide -f

restart: stop start            ## Restart the service

start:                         ## Start the service
	systemctl start aide

stop:                          ## Stop the service
	systemctl stop aide

upgrade:                       ## Upgrade to a new version (VERSION=v1.2.3)
	@test -n "$(VERSION)" || (echo "VERSION is required, e.g. make upgrade VERSION=v1.2.3" >&2; exit 1)
	npm install -g --no-audit --no-fund @aide/cli@$(VERSION)
	rsync -a --delete --exclude=node_modules $$(npm root -g)/@aide/cli/ /opt/aide/
	chown -R aide:aide /opt/aide
	systemctl restart aide
	@echo "✔ Upgraded to $(VERSION)"

nginx-test:                    ## Validate the nginx config
	nginx -t
