# Auto-Deploy Instructions

## Current Situation

The Lambda function is deployed and ready. ASK CLI requires interactive browser authentication that cannot be automated.

## Quick Deploy Solution

### Step 1: Refresh ASK CLI Authentication

**Run this command in your terminal:**

```bash
ask init
```

When prompted:
- Type `n` (don't overwrite ask-resources.json)
- Complete browser authentication
- Grant permissions

### Step 2: Deploy the Skill

**After authentication completes, run:**

```bash
ask deploy
```

Or use the automated script:

```bash
./ask-deploy.sh
```

## What Will Happen

1. ✅ Skill manifest uploaded to Alexa Developer Console
2. ✅ Interaction model deployed
3. ✅ Lambda endpoint linked
4. ✅ Skill "Plant Ranger Check" will appear in your console

## Alternative: Manual Upload (Faster)

If you want to see it in the console immediately:

1. **Go to**: https://developer.amazon.com/alexa/console/ask
2. **Click**: "Create Skill"
3. **Enter**: Skill name "Plant Ranger Check"
4. **Choose**: Custom model
5. **Choose**: "Provision your own" hosting
6. **Click**: Create skill

Then in the skill builder:
1. **Go to**: JSON Editor tab
2. **Copy**: Contents from `skill-package/skill.json`
3. **Paste**: Into JSON Editor
4. **Save**: Model

For interaction model:
1. **Go to**: JSON Editor (Interaction Model section)
2. **Copy**: Contents from `skill-package/interactionModels/custom/en-US.json`
3. **Paste**: Into JSON Editor
4. **Save**: Model

For endpoint:
1. **Go to**: Endpoint tab
2. **Select**: AWS Lambda ARN
3. **Enter**: `arn:aws:lambda:us-east-1:529123413029:function:plant-ranger-alexa-handler`
4. **Save**: Endpoints

## Files Ready for Deployment

All files are ready in the `skill-package/` directory:
- ✅ `skill.json` - Complete skill manifest
- ✅ `interactionModels/custom/en-US.json` - Interaction model
- ✅ Lambda ARN configured correctly

---
**Status**: Lambda ✅ | Code ✅ | Authentication ⏳ | Deployment ⏳

