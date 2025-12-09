-- =====================================================
-- SolarWinds PostgreSQL Network Topology Example Queries
-- =====================================================

-- =====================================================
-- BASIC QUERIES
-- =====================================================

-- Get all devices
SELECT node_id, node_name, ip_address, vendor, machine_type, status_description
FROM devices
ORDER BY node_name
LIMIT 25;

-- Get all interfaces with their device information
SELECT
  d.node_name,
  i.interface_name,
  i.oper_status,
  i.admin_status,
  i.speed / 1000000 AS speed_mbps
FROM interfaces i
JOIN devices d ON i.node_id = d.node_id
ORDER BY d.node_name, i.interface_name
LIMIT 50;

-- Get all IP addresses with device and interface info
SELECT
  d.node_name,
  i.interface_name,
  ip.ip_address,
  ip.subnet_mask
FROM ip_addresses ip
JOIN interfaces i ON ip.interface_id = i.interface_id
JOIN devices d ON i.node_id = d.node_id
ORDER BY d.node_name, ip.ip_address
LIMIT 50;

-- =====================================================
-- TOPOLOGY ANALYSIS
-- =====================================================

-- View all network connections
SELECT
  d1.node_name AS local_device,
  i1.interface_name AS local_interface,
  d2.node_name AS remote_device,
  i2.interface_name AS remote_interface,
  c.connection_type
FROM connections c
JOIN interfaces i1 ON c.local_interface_id = i1.interface_id
JOIN devices d1 ON i1.node_id = d1.node_id
JOIN interfaces i2 ON c.remote_interface_id = i2.interface_id
JOIN devices d2 ON i2.node_id = d2.node_id
ORDER BY d1.node_name, i1.interface_name
LIMIT 50;

-- Find devices connected to a specific device
SELECT DISTINCT
  d2.node_name AS connected_device,
  d2.ip_address,
  d2.vendor,
  c.connection_type
FROM connections c
JOIN interfaces i1 ON c.local_interface_id = i1.interface_id
JOIN devices d1 ON i1.node_id = d1.node_id
JOIN interfaces i2 ON c.remote_interface_id = i2.interface_id
JOIN devices d2 ON i2.node_id = d2.node_id
WHERE d1.node_name = 'YOUR_DEVICE_NAME'
ORDER BY d2.node_name;

-- Count connections per device
SELECT
  d.node_name,
  d.ip_address,
  COUNT(DISTINCT c.connection_id) AS connection_count
FROM devices d
JOIN interfaces i ON d.node_id = i.node_id
LEFT JOIN connections c ON i.interface_id = c.local_interface_id
GROUP BY d.node_id, d.node_name, d.ip_address
ORDER BY connection_count DESC
LIMIT 20;

-- =====================================================
-- DEVICE INVENTORY
-- =====================================================

-- Count devices by vendor
SELECT
  vendor,
  COUNT(*) AS device_count
FROM devices
WHERE vendor IS NOT NULL
GROUP BY vendor
ORDER BY device_count DESC;

-- Count devices by location
SELECT
  location,
  COUNT(*) AS device_count
FROM devices
WHERE location IS NOT NULL
GROUP BY location
ORDER BY device_count DESC;

-- Count devices by type
SELECT
  machine_type,
  COUNT(*) AS device_count
FROM devices
WHERE machine_type IS NOT NULL
GROUP BY machine_type
ORDER BY device_count DESC;

-- Find devices by vendor and location
SELECT node_name, ip_address, machine_type, status_description
FROM devices
WHERE vendor = 'Cisco Systems'
  AND location = 'Data Center A'
ORDER BY node_name;

-- =====================================================
-- NETWORK HEALTH MONITORING
-- =====================================================

-- Find all devices that are down
SELECT node_name, ip_address, location, status_description, last_updated
FROM devices
WHERE status_description != 'Up'
ORDER BY node_name;

-- Find interfaces that are down
SELECT
  d.node_name,
  i.interface_name,
  i.admin_status,
  i.oper_status,
  i.last_updated
FROM interfaces i
JOIN devices d ON i.node_id = d.node_id
WHERE i.oper_status != 1
ORDER BY d.node_name, i.interface_name;

-- Devices with the most down interfaces
SELECT
  d.node_name,
  d.ip_address,
  COUNT(i.interface_id) AS down_interfaces
FROM devices d
JOIN interfaces i ON d.node_id = i.node_id
WHERE i.oper_status != 1
GROUP BY d.node_id, d.node_name, d.ip_address
ORDER BY down_interfaces DESC
LIMIT 10;

-- =====================================================
-- INTERFACE STATISTICS
-- =====================================================

-- High-speed interfaces (10 Gbps and above)
SELECT
  d.node_name,
  i.interface_name,
  i.speed / 1000000000.0 AS speed_gbps,
  i.interface_type_description,
  i.oper_status
FROM interfaces i
JOIN devices d ON i.node_id = d.node_id
WHERE i.speed >= 10000000000
ORDER BY i.speed DESC
LIMIT 50;

-- Interfaces with bandwidth data
SELECT
  d.node_name,
  i.interface_name,
  i.speed / 1000000 AS speed_mbps,
  i.in_bandwidth,
  i.out_bandwidth,
  i.oper_status
FROM interfaces i
JOIN devices d ON i.node_id = d.node_id
WHERE i.in_bandwidth IS NOT NULL OR i.out_bandwidth IS NOT NULL
ORDER BY d.node_name, i.interface_name
LIMIT 50;

-- Count interfaces per device
SELECT
  d.node_name,
  d.ip_address,
  COUNT(i.interface_id) AS interface_count
FROM devices d
LEFT JOIN interfaces i ON d.node_id = i.node_id
GROUP BY d.node_id, d.node_name, d.ip_address
ORDER BY interface_count DESC
LIMIT 20;

-- =====================================================
-- IP ADDRESS ANALYSIS
-- =====================================================

-- Find all IP addresses in a subnet
SELECT
  d.node_name,
  i.interface_name,
  ip.ip_address,
  ip.subnet_mask
FROM ip_addresses ip
JOIN interfaces i ON ip.interface_id = i.interface_id
JOIN devices d ON i.node_id = d.node_id
WHERE ip.ip_address LIKE '192.168.1.%'
ORDER BY ip.ip_address;

-- Count IP addresses per device
SELECT
  d.node_name,
  d.ip_address AS primary_ip,
  COUNT(ip.ip_address_id) AS ip_count
FROM devices d
JOIN interfaces i ON d.node_id = i.node_id
LEFT JOIN ip_addresses ip ON i.interface_id = ip.interface_id
GROUP BY d.node_id, d.node_name, d.ip_address
ORDER BY ip_count DESC
LIMIT 20;

-- Find duplicate IP addresses (configuration issues)
SELECT
  ip.ip_address,
  COUNT(DISTINCT d.node_id) AS device_count,
  STRING_AGG(DISTINCT d.node_name, ', ') AS devices
FROM ip_addresses ip
JOIN interfaces i ON ip.interface_id = i.interface_id
JOIN devices d ON i.node_id = d.node_id
GROUP BY ip.ip_address
HAVING COUNT(DISTINCT d.node_id) > 1
ORDER BY device_count DESC;

-- =====================================================
-- ADVANCED QUERIES
-- =====================================================

-- Device connectivity matrix (which devices are connected)
SELECT
  d1.node_name AS device1,
  d2.node_name AS device2,
  COUNT(*) AS connection_count,
  STRING_AGG(DISTINCT c.connection_type, ', ') AS protocols
FROM connections c
JOIN interfaces i1 ON c.local_interface_id = i1.interface_id
JOIN devices d1 ON i1.node_id = d1.node_id
JOIN interfaces i2 ON c.remote_interface_id = i2.interface_id
JOIN devices d2 ON i2.node_id = d2.node_id
GROUP BY d1.node_name, d2.node_name
ORDER BY connection_count DESC;

-- Find leaf devices (devices with only one connection)
SELECT
  d.node_name,
  d.ip_address,
  COUNT(DISTINCT c.connection_id) AS connections
FROM devices d
JOIN interfaces i ON d.node_id = i.node_id
LEFT JOIN connections c ON i.interface_id = c.local_interface_id
GROUP BY d.node_id, d.node_name, d.ip_address
HAVING COUNT(DISTINCT c.connection_id) = 1
ORDER BY d.node_name;

-- Find isolated devices (no connections)
SELECT
  d.node_name,
  d.ip_address,
  d.vendor,
  d.location
FROM devices d
WHERE NOT EXISTS (
  SELECT 1
  FROM interfaces i
  JOIN connections c ON i.interface_id = c.local_interface_id
  WHERE i.node_id = d.node_id
)
ORDER BY d.node_name;

-- Potential core/distribution layer devices (highly connected)
SELECT
  d.node_name,
  d.ip_address,
  d.location,
  COUNT(DISTINCT c.connection_id) AS connections
FROM devices d
JOIN interfaces i ON d.node_id = i.node_id
LEFT JOIN connections c ON i.interface_id = c.local_interface_id
GROUP BY d.node_id, d.node_name, d.ip_address, d.location
HAVING COUNT(DISTINCT c.connection_id) >= 5
ORDER BY connections DESC;

-- =====================================================
-- DATA QUALITY CHECKS
-- =====================================================

-- Interfaces without IP addresses
SELECT
  d.node_name,
  i.interface_name,
  i.oper_status
FROM interfaces i
JOIN devices d ON i.node_id = d.node_id
LEFT JOIN ip_addresses ip ON i.interface_id = ip.interface_id
WHERE ip.ip_address_id IS NULL
  AND i.oper_status = 1  -- Only show up interfaces
ORDER BY d.node_name, i.interface_name
LIMIT 50;

-- Check data freshness
SELECT
  'devices' AS table_name,
  MAX(last_updated) AS latest_update,
  MIN(last_updated) AS oldest_update
FROM devices
UNION ALL
SELECT
  'interfaces',
  MAX(last_updated),
  MIN(last_updated)
FROM interfaces
UNION ALL
SELECT
  'ip_addresses',
  MAX(last_updated),
  MIN(last_updated)
FROM ip_addresses
UNION ALL
SELECT
  'connections',
  MAX(last_updated),
  MIN(last_updated)
FROM connections;

-- =====================================================
-- REPORTING QUERIES
-- =====================================================

-- Executive summary
SELECT
  (SELECT COUNT(*) FROM devices) AS total_devices,
  (SELECT COUNT(*) FROM devices WHERE status_description = 'Up') AS up_devices,
  (SELECT COUNT(*) FROM interfaces) AS total_interfaces,
  (SELECT COUNT(*) FROM interfaces WHERE oper_status = 1) AS up_interfaces,
  (SELECT COUNT(*) FROM ip_addresses) AS total_ips,
  (SELECT COUNT(*) FROM connections) AS total_connections;

-- Vendor distribution report
SELECT
  COALESCE(vendor, 'Unknown') AS vendor,
  COUNT(*) AS devices,
  COUNT(CASE WHEN status_description = 'Up' THEN 1 END) AS up,
  COUNT(CASE WHEN status_description != 'Up' THEN 1 END) AS down,
  ROUND(100.0 * COUNT(CASE WHEN status_description = 'Up' THEN 1 END) / COUNT(*), 2) AS uptime_percent
FROM devices
GROUP BY vendor
ORDER BY devices DESC;

-- Location summary report
SELECT
  COALESCE(location, 'Unknown') AS location,
  COUNT(*) AS devices,
  COUNT(DISTINCT vendor) AS vendors,
  COUNT(CASE WHEN status_description = 'Up' THEN 1 END) AS up,
  COUNT(CASE WHEN status_description != 'Up' THEN 1 END) AS down
FROM devices
GROUP BY location
ORDER BY devices DESC;

-- =====================================================
-- EXPORT QUERIES
-- =====================================================

-- Export device inventory to CSV format
COPY (
  SELECT
    node_name,
    ip_address,
    vendor,
    machine_type,
    location,
    status_description,
    ios_version
  FROM devices
  ORDER BY node_name
) TO '/tmp/device_inventory.csv' WITH CSV HEADER;

-- Export network connections to CSV format
COPY (
  SELECT
    d1.node_name AS local_device,
    i1.interface_name AS local_interface,
    d2.node_name AS remote_device,
    i2.interface_name AS remote_interface,
    c.connection_type
  FROM connections c
  JOIN interfaces i1 ON c.local_interface_id = i1.interface_id
  JOIN devices d1 ON i1.node_id = d1.node_id
  JOIN interfaces i2 ON c.remote_interface_id = i2.interface_id
  JOIN devices d2 ON i2.node_id = d2.node_id
  ORDER BY d1.node_name, i1.interface_name
) TO '/tmp/network_connections.csv' WITH CSV HEADER;
