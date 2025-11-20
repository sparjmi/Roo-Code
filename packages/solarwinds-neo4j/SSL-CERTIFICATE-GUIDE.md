# Exporting SolarWinds SSL Certificate for 2025.2.1+

This guide helps you export the SSL certificate from your SolarWinds NPM server for use with the integration.

## Why is this needed?

Starting with **SolarWinds Platform 2025.2**, SSL certificate validation is enforced by default. If your SolarWinds server uses a self-signed certificate, you need to export it and provide it to the integration for proper SSL verification.

## Method 1: PowerShell (Recommended)

### Step 1: Connect to your SolarWinds server via RDP or PowerShell remoting

### Step 2: Export the certificate

```powershell
# Find the SolarWinds certificate
$cert = Get-ChildItem -Path Cert:\LocalMachine\My | Where-Object {
    $_.Subject -like "*your-solarwinds-server*" -or
    $_.Subject -like "*$(hostname)*"
}

# Display the certificate to verify it's the correct one
$cert | Format-List Subject, Issuer, NotBefore, NotAfter, Thumbprint

# Export the certificate in DER format
Export-Certificate -Cert $cert -FilePath C:\solarwinds-cert.cer

Write-Host "Certificate exported to C:\solarwinds-cert.cer"
```

### Step 3: Convert to PEM format (if needed)

If you're running the integration on Linux/Mac or prefer PEM format:

```bash
# Using OpenSSL (run on your local machine after copying the .cer file)
openssl x509 -inform DER -in solarwinds-cert.cer -out solarwinds-cert.pem

# Or using PowerShell on Windows
certutil -encode solarwinds-cert.cer solarwinds-cert.pem
```

### Step 4: Copy the certificate to your integration server

```bash
# Example using scp
scp solarwinds-cert.pem user@integration-server:/path/to/certs/
```

## Method 2: Certificate Manager (MMC)

### Step 1: Open Certificate Manager

1. Press `Win + R` to open Run dialog
2. Type `mmc.exe` and press Enter
3. Go to **File** → **Add/Remove Snap-in**
4. Select **Certificates** → Click **Add**
5. Choose **Computer account** → Click **Next**
6. Select **Local computer** → Click **Finish**
7. Click **OK**

### Step 2: Locate the SolarWinds certificate

1. Navigate to **Certificates (Local Computer)** → **Personal** → **Certificates**
2. Look for the certificate with the subject matching your SolarWinds server hostname
3. You can identify it by:
   - **Issued To**: Your SolarWinds server hostname
   - **Issued By**: (for self-signed) Same as "Issued To"
   - **Expiration Date**: Check it's still valid

### Step 3: Export the certificate

1. Right-click the certificate
2. Select **All Tasks** → **Export**
3. Click **Next** in the Certificate Export Wizard
4. Select **No, do not export the private key** → Click **Next**
5. Select **Base-64 encoded X.509 (.CER)** → Click **Next**
6. Choose a location and filename (e.g., `C:\solarwinds-cert.pem`) → Click **Next**
7. Click **Finish**

### Step 4: Copy to integration server

Copy the exported `.pem` file to your integration server where you're running the Node.js application.

## Method 3: Extract from browser

If you can access the SolarWinds web interface via HTTPS:

1. Open your browser and navigate to your SolarWinds server (e.g., `https://your-solarwinds-server.com`)
2. Click the padlock icon in the address bar
3. Click **Certificate** or **Certificate is valid**
4. Go to the **Details** tab
5. Click **Export** or **Copy to File**
6. Save as Base-64 encoded X.509 (.CER or .PEM)

## Verifying the exported certificate

To verify the certificate was exported correctly:

### On Windows (PowerShell):
```powershell
Get-Content solarwinds-cert.pem
# Should start with: -----BEGIN CERTIFICATE-----
# Should end with: -----END CERTIFICATE-----
```

### On Linux/Mac:
```bash
# View certificate details
openssl x509 -in solarwinds-cert.pem -text -noout

# Verify the certificate can be read
cat solarwinds-cert.pem
# Should start with: -----BEGIN CERTIFICATE-----
# Should end with: -----END CERTIFICATE-----
```

## Configure the integration

Once you have the certificate file:

1. Copy it to a secure location on your integration server
2. Update your `.env` file:

```env
SOLARWINDS_CERT_PATH=/path/to/solarwinds-cert.pem
SOLARWINDS_VERIFY_SSL=true
```

## Troubleshooting

### Error: "unable to get local issuer certificate"

This means the certificate chain is incomplete. You need to export the entire certificate chain:

```powershell
# Export with full chain (PowerShell)
$cert = Get-ChildItem -Path Cert:\LocalMachine\My | Where-Object {$_.Subject -like "*your-server*"}
$chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
$chain.Build($cert)

# Export each certificate in the chain
$i = 0
foreach ($element in $chain.ChainElements) {
    $filename = "solarwinds-cert-chain-$i.cer"
    Export-Certificate -Cert $element.Certificate -FilePath $filename
    $i++
}
```

Then combine them into one PEM file:
```bash
cat solarwinds-cert-chain-*.cer > solarwinds-full-chain.pem
```

### Error: "Hostname/IP does not match certificate's altnames"

The certificate's Common Name (CN) or Subject Alternative Names (SANs) don't match the hostname/IP you're using in `SOLARWINDS_URL`.

**Solutions**:
1. Update `SOLARWINDS_URL` to match the certificate's CN
2. Regenerate the SolarWinds certificate with the correct hostname/IP
3. As a last resort for development only: Set `SOLARWINDS_VERIFY_SSL=false`

### Error: "certificate has expired"

The SolarWinds certificate has expired. You need to:
1. Generate a new certificate on the SolarWinds server
2. Export the new certificate
3. Update the certificate file used by the integration

## Security Best Practices

1. **Store certificates securely**: Keep certificate files in a protected directory with restricted permissions
   ```bash
   chmod 600 /path/to/solarwinds-cert.pem
   ```

2. **Use valid certificates in production**: Self-signed certificates should only be used in development/testing environments

3. **Monitor certificate expiration**: Set up alerts to renew certificates before they expire

4. **Never disable SSL verification in production**: Always use `SOLARWINDS_VERIFY_SSL=true` in production environments

## Alternative: Use a Proper SSL Certificate

Instead of exporting self-signed certificates, consider installing a valid SSL certificate on your SolarWinds server:

1. **Option A**: Use Let's Encrypt for free SSL certificates
2. **Option B**: Purchase a certificate from a trusted CA
3. **Option C**: Use your organization's internal CA

This eliminates the need to export and configure certificate files for each integration.
