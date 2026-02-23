pipeline {
    agent any

    triggers {
        // Daily sync at 3am PST (10:00 UTC)
        cron('0 10 * * *')
        // GitHub webhook pushes handled automatically by Jenkins GitHub plugin
    }

    parameters {
        booleanParam(name: 'SYNC_ONLY', defaultValue: false, description: 'Only sync with upstream (no build/deploy)')
        booleanParam(name: 'SKIP_SYNC', defaultValue: false, description: 'Skip upstream sync (build/deploy only)')
    }

    environment {
        REGISTRY_HOSTNAME = credentials('registry-hostname')
        REGISTRY_CREDS    = credentials('registry-credentials')
        KUBECONFIG_CRED   = credentials('kubeconfig')
    }

    stages {
        stage('Sync Upstream') {
            when {
                allOf {
                    anyOf {
                        triggeredBy 'TimerTrigger'
                        triggeredBy 'UserIdCause'
                    }
                    expression { return !params.SKIP_SYNC }
                }
            }
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: 'main']],
                    extensions: [[$class: 'CloneOption', depth: 0, shallow: false]],
                    userRemoteConfigs: [[
                        url: 'git@github.com:Davinci-Technology/LibreChat.git',
                        credentialsId: 'github-ssh-key'
                    ]]
                ])

                sh '''
                    git config user.name 'Jenkins CI'
                    git config user.email 'jenkins@davincisolutions.ai'

                    # Setup upstream remote
                    if git remote | grep -q "^upstream$"; then
                        git remote set-url upstream https://github.com/danny-avila/LibreChat.git
                    else
                        git remote add upstream https://github.com/danny-avila/LibreChat.git
                    fi
                    git fetch upstream

                    # Merge with conflict resolution
                    git checkout main

                    if git merge upstream/main --no-edit; then
                        echo "Merge completed cleanly."
                    else
                        echo "Merge conflicts detected, resolving known patterns..."

                        # 1. Workflows: delete upstream workflows, keep ours
                        find .github/workflows -name "*.yml" -not -name "build-container.yaml" -delete 2>/dev/null || true
                        find .github/workflows -name "*.yaml" -not -name "build-container.yaml" -delete 2>/dev/null || true
                        git checkout --ours -- .github/workflows/build-container.yaml 2>/dev/null || true
                        git add .github/workflows/

                        # 2. Custom files: keep ours
                        for f in \
                          Dockerfile \
                          Jenkinsfile \
                          packages/api/src/mcp/connection.ts \
                          packages/api/package.json \
                          api/app/clients/tools/util/handleTools.js \
                          api/app/clients/tools/index.js; do
                          if git diff --name-only --diff-filter=U | grep -q "^${f}$"; then
                            echo "Resolving $f -> keeping ours"
                            git checkout --ours -- "$f"
                            git add "$f"
                          fi
                        done

                        # 3. CLAUDE.md: handle distinct types conflict
                        if ls CLAUDE.md~* 1>/dev/null 2>&1 || git status --porcelain | grep -q "CLAUDE.md"; then
                          echo "Resolving CLAUDE.md distinct types conflict -> keeping ours"
                          if [ -f "CLAUDE.md~HEAD" ]; then
                            cp "CLAUDE.md~HEAD" CLAUDE.md
                          fi
                          for variant in CLAUDE.md~HEAD "CLAUDE.md~upstream/main"; do
                            rm -f "$variant" 2>/dev/null || true
                            git update-index --force-remove "$variant" 2>/dev/null || true
                          done
                          git add CLAUDE.md
                          git rm -f AGENTS.md 2>/dev/null || true
                          rm -f AGENTS.md 2>/dev/null || true
                        fi

                        # 4. package.json / package-lock.json: accept upstream
                        for f in package.json package-lock.json; do
                          if git diff --name-only --diff-filter=U | grep -q "^${f}$"; then
                            echo "Resolving $f -> accepting upstream"
                            git checkout --theirs -- "$f"
                            git add "$f"
                          fi
                        done

                        # 5. Fail on unknown conflicts
                        REMAINING=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
                        if [ -n "$REMAINING" ]; then
                          echo "ERROR: Unresolved merge conflicts in:"
                          echo "$REMAINING"
                          exit 1
                        fi

                        git commit --no-edit
                    fi

                    # Post-merge: regenerate lockfile for custom deps
                    npm install --package-lock-only --ignore-scripts 2>/dev/null && git add package-lock.json
                    if ! git diff --cached --quiet -- package-lock.json; then
                      git commit -m "Regenerate package-lock.json for custom dependencies"
                    fi

                    # Post-merge: remove upstream workflows that merged cleanly
                    REMOVED=false
                    for wf in .github/workflows/*.yml .github/workflows/*.yaml; do
                      if [ -f "$wf" ] && [ "$(basename "$wf")" != "build-container.yaml" ]; then
                        rm "$wf"
                        git add "$wf"
                        REMOVED=true
                      fi
                    done
                    if [ "$REMOVED" = true ]; then
                      git commit -m "Remove upstream workflows" || true
                    fi

                    git push origin main
                '''
            }
        }

        stage('Build') {
            when {
                expression { return !params.SYNC_ONLY }
            }
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: 'main']],
                    userRemoteConfigs: [[
                        url: 'git@github.com:Davinci-Technology/LibreChat.git',
                        credentialsId: 'github-ssh-key'
                    ]]
                ])

                sh '''
                    echo "${REGISTRY_CREDS_PSW}" | docker login \
                        --username "${REGISTRY_CREDS_USR}" \
                        --password-stdin "${REGISTRY_HOSTNAME}"

                    docker build -t librechat:davinci .
                    docker tag librechat:davinci ${REGISTRY_HOSTNAME}/librechat:davinci
                    docker push ${REGISTRY_HOSTNAME}/librechat:davinci
                '''
            }
        }

        stage('Deploy') {
            when {
                expression { return !params.SYNC_ONLY }
            }
            steps {
                sh '''
                    export KUBECONFIG="${KUBECONFIG_CRED}"
                    kubectl -n librechat rollout restart deployment/librechat-prd-librechat
                '''
            }
        }
    }

    post {
        failure {
            echo 'Pipeline failed. Check logs for merge conflicts or build errors.'
        }
    }
}
