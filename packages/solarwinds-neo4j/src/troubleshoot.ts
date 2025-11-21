#!/usr/bin/env node
/**
 * Troubleshooting script to discover available entities in SolarWinds
 *
 * This script helps diagnose connection issues and discover what
 * topology entities are available in your SolarWinds NPM instance.
 *
 * Usage:
 *   node troubleshoot.js
 *   or
 *   pnpm troubleshoot
 */

import * as dotenv from 'dotenv';
import { SolarWindsClient } from './solarwinds-client';

// Load environment variables
dotenv.config();

async function troubleshoot() {
  console.log('=== SolarWinds NPM Troubleshooting ===\n');

  // Check environment variables
  console.log('1. Checking Configuration...');
  const requiredEnvVars = [
    'SOLARWINDS_URL',
    'SOLARWINDS_USERNAME',
    'SOLARWINDS_PASSWORD',
  ];

  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please configure your .env file');
    process.exit(1);
  }

  console.log('✓ Configuration loaded');
  console.log(`   URL: ${process.env.SOLARWINDS_URL}`);
  console.log(`   Username: ${process.env.SOLARWINDS_USERNAME}`);
  console.log(`   SSL Verification: ${process.env.SOLARWINDS_VERIFY_SSL !== 'false' ? 'Enabled' : 'Disabled'}`);
  if (process.env.SOLARWINDS_CERT_PATH) {
    console.log(`   Certificate Path: ${process.env.SOLARWINDS_CERT_PATH}`);
  }

  // Initialize client
  const client = new SolarWindsClient({
    baseUrl: process.env.SOLARWINDS_URL!,
    username: process.env.SOLARWINDS_USERNAME!,
    password: process.env.SOLARWINDS_PASSWORD!,
    verifySSL: process.env.SOLARWINDS_VERIFY_SSL !== 'false',
    certificatePath: process.env.SOLARWINDS_CERT_PATH,
  });

  // Test connection
  console.log('\n2. Testing Connection to SolarWinds...');
  const connected = await client.testConnection();
  if (!connected) {
    console.error('❌ Failed to connect to SolarWinds');
    console.error('Please check your credentials and SSL configuration');
    process.exit(1);
  }
  console.log('✓ Successfully connected to SolarWinds');

  // Discover available entities
  console.log('\n3. Discovering Available Entities...');
  const availableEntities = await client.discoverTopologyEntities();

  console.log('\nAvailable Entities:');
  if (availableEntities.length === 0) {
    console.log('   ⚠️  No topology entities found');
  } else {
    availableEntities.forEach((entity) => {
      console.log(`   ✓ ${entity}`);
    });
  }

  // Test data retrieval
  console.log('\n4. Testing Data Retrieval...');

  try {
    console.log('\n   Testing Nodes...');
    const nodes = await client.getNodes();
    console.log(`   ✓ Fetched ${nodes.length} nodes`);
    if (nodes.length > 0) {
      console.log(`   Example: ${nodes[0].Caption} (${nodes[0].IPAddress})`);
    }
  } catch (error) {
    console.error('   ❌ Failed to fetch nodes:', error);
  }

  try {
    console.log('\n   Testing Interfaces...');
    const interfaces = await client.getInterfaces();
    console.log(`   ✓ Fetched ${interfaces.length} interfaces`);
    if (interfaces.length > 0) {
      console.log(`   Example: ${interfaces[0].Caption} on Node ${interfaces[0].NodeID}`);
    }
  } catch (error) {
    console.error('   ❌ Failed to fetch interfaces:', error);
  }

  try {
    console.log('\n   Testing Connections...');
    const connections = await client.getConnections();
    if (connections.length > 0) {
      console.log(`   ✓ Fetched ${connections.length} connections`);
      console.log(`   Example: Node ${connections[0].LocalNodeID} -> Node ${connections[0].RemoteNodeID} (${connections[0].ConnectionType})`);
    } else {
      console.log('   ⚠️  No connections found');
      console.log('   This may indicate that topology discovery (CDP/LLDP) is not enabled');
    }
  } catch (error) {
    console.error('   ❌ Failed to fetch connections:', error);
  }

  try {
    console.log('\n   Testing IP Addresses...');
    const ipAddresses = await client.getIPAddresses();
    if (ipAddresses.length > 0) {
      console.log(`   ✓ Fetched ${ipAddresses.length} IP addresses`);
      console.log(`   Example: ${ipAddresses[0].IPAddress} on Interface ${ipAddresses[0].InterfaceID}`);
    } else {
      console.log('   ⚠️  No IP addresses found');
      console.log('   IP address entities may not be available in this SolarWinds instance');
    }
  } catch (error) {
    console.error('   ❌ Failed to fetch IP addresses');
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
  }

  // Recommendations
  console.log('\n5. Recommendations:');
  if (!availableEntities.includes('Orion.Topology.InterfaceNeighbors') &&
      !availableEntities.includes('Orion.NPM.InterfaceNeighbors') &&
      !availableEntities.includes('Orion.NPM.CDPNeighbors') &&
      !availableEntities.includes('Orion.NPM.LLDPNeighbors')) {
    console.log('   ⚠️  No topology discovery entities found');
    console.log('   To enable network topology connections:');
    console.log('   1. Enable CDP or LLDP on your network devices');
    console.log('   2. Configure SolarWinds NPM to discover Layer 2 topology');
    console.log('   3. Wait for the next discovery poll to complete');
    console.log('   Without topology discovery, you will still get devices and interfaces,');
    console.log('   but not the connections between them.');
  } else {
    console.log('   ✓ Your SolarWinds instance appears to be properly configured');
    console.log('   You should be able to build a complete network topology');
  }

  console.log('\n=== Troubleshooting Complete ===');
}

// Run troubleshooting
troubleshoot().catch((error) => {
  console.error('\nFatal error during troubleshooting:', error);
  process.exit(1);
});
