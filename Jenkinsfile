pipeline {
  agent any

  environment {
    IMAGE = "localhost:5050/root/jarvis-frontend"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.IMAGE_TAG = sh(script: 'git rev-parse --short=8 HEAD', returnStdout: true).trim()
        }
      }
    }

    stage('Lint & build') {
      steps {
        // Jenkins' own agent has no Node toolchain (deliberately); run this
        // in the same node image the Dockerfile itself builds from. This is
        // Docker-outside-of-Docker (Jenkins talks to the *host's* daemon
        // via the mounted socket) — docker-workflow's .inside() handles
        // the workspace volume sharing via --volumes-from automatically.
        script {
          docker.image('node:22-alpine').inside {
            // This host's IPv6 path is broken — node:22-alpine is
            // musl-based so /etc/gai.conf doesn't apply; Node's own
            // --dns-result-order is the equivalent knob.
            withEnv(['NODE_OPTIONS=--dns-result-order=ipv4first']) {
              sh 'npm ci'
              sh 'npm run lint'
              sh 'npm run build'
            }
          }
        }
      }
    }

    stage('Build image') {
      steps {
        // --network=host: same fix as jarvis-backend/jarvis-file-service's
        // Jenkinsfiles — this host's Docker bridge network is markedly
        // slower (and, on 2026-09-29, outright dropped mid-`npm ci`) than
        // the host's own network stack. DOCKER_BUILDKIT=1 because the
        // Dockerfile's npm layer now uses a cache mount, which the classic
        // builder ignores in silence rather than erroring on. --provenance=
        // false because BuildKit's default attestation turns the image
        // into an OCI index with a second, non-image manifest — jarvis-
        // backend and jarvis-file-service both hit `docker push` failing
        // with MANIFEST_BLOB_UNKNOWN on their first BuildKit build before
        // this flag was added; applying it here from the start rather than
        // rediscovering the same failure on this repo's first BuildKit push.
        sh """DOCKER_BUILDKIT=1 docker build --network=host --provenance=false \
              --build-arg NEXT_PUBLIC_API_URL=http://api.jarvis.local \
              --build-arg NEXT_PUBLIC_KEYCLOAK_ISSUER=http://auth.jarvis.local/realms/jarvis \
              -t ${IMAGE}:${IMAGE_TAG} ."""
      }
    }

    stage('Push image') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'gitlab-registry', usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')]) {
          sh 'echo "$REG_PASS" | docker login localhost:5050 -u "$REG_USER" --password-stdin'
          sh "docker push ${IMAGE}:${IMAGE_TAG}"
        }
      }
    }

    stage('Bump manifest') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'gitlab-repo', usernameVariable: 'GIT_USER', passwordVariable: 'GIT_TOKEN')]) {
          sh '''
            rm -rf deploy-repo
            git clone "http://${GIT_USER}:${GIT_TOKEN}@gitlab:8929/root/jarvis-deploy.git" deploy-repo
            cd deploy-repo/frontend/overlays/test
            kustomize edit set image jarvis-frontend=host.minikube.internal:5050/root/jarvis-frontend:${IMAGE_TAG}
            cd ../../..
            git config user.email "jenkins@localhost"
            git config user.name "jenkins-bot"
            git add frontend/overlays/test/kustomization.yaml
            git diff --cached --quiet && echo "no manifest changes" && exit 0
            git commit -m "ci: bump jarvis-frontend to ${IMAGE_TAG}"
            git push "http://${GIT_USER}:${GIT_TOKEN}@gitlab:8929/root/jarvis-deploy.git" HEAD:main
          '''
        }
      }
    }
  }
}
