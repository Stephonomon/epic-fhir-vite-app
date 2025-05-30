# Syncing GitHub Repo to Azure DevOps Repo (Frontend)

This guide helps you mirror or push your GitHub frontend repository to an Azure DevOps repo. It includes initial setup and instructions for future updates.

---

## 📦 Prerequisites

- You must already have a GitHub repository cloned locally.
- You must have access to the Azure DevOps repository.
- Git must be installed and authenticated for Azure DevOps (use a Personal Access Token if required).

---

## 🛠 Initial Setup: Add Azure DevOps as a Remote

1. **Navigate to your GitHub project directory**:
   ```bash
   cd /path/to/your/github-repo
   ```

2. **Add Azure DevOps as a new remote**:
   > This example uses the name `azure` to keep GitHub as `origin`.

   ```bash
   git remote add azure https://CHOP365@dev.azure.com/CHOP365/CHOP%20Azure%20Open%20AI/_git/chipper-frontend
   ```

3. **Push all branches and tags to Azure DevOps**:
   ```bash
   git push -u azure --all      # Push all branches
   git push azure --tags        # Push all tags
   ```

---

## 🔁 Future Updates

Whenever you make new commits and want to sync them to Azure DevOps:

1. **Push latest commits to Azure**:
   ```bash
   git push azure
   ```

2. *(Optional)* **Push tags if you created new ones**:
   ```bash
   git push azure --tags
   ```

1. **Push updates to `development`**:
   ```bash
   git checkout development
   git push azure
   ```

2. *(Optional)* **Push tags if you created new ones**:
   ```bash
   git push azure --tags
   ```

---

## 🔍 Useful Commands

- **Check your remotes**:
  ```bash
  git remote -v
  ```

- **Remove or rename remotes**:
  ```bash
  git remote remove azure
  git remote rename origin github
  ```

- **Set upstream for a branch (if needed)**:
  ```bash
  git push --set-upstream azure <branch-name>
  ```

---

## 📝 Notes

- You can maintain both GitHub and Azure remotes:
  - `origin` → GitHub
  - `azure` → Azure DevOps

- To push to both remotes:
  ```bash
  git push origin && git push azure
  ```

- Make sure to use URL encoding if your Azure project name contains spaces (`CHOP Azure Open AI` becomes `CHOP%20Azure%20Open%20AI`).

---
