module.exports = {
    /**
     * Marks an area as dangerous after a creep is killed
     * @param {RoomPosition} position - The position where the creep was killed
     * @param {string} roomName - The name of the room
     */
    markDangerousArea: function(position, roomName) {
        // Skip if dangerous area avoidance is disabled
        const config = require('config');
        if (!config.dangerousAreas.enabled) {
            return;
        }

        // Initialize memory structure if it doesn't exist
        if (!Memory.dangerousAreas) {
            Memory.dangerousAreas = {};
        }
        if (!Memory.dangerousAreas[roomName]) {
            Memory.dangerousAreas[roomName] = {};
        }

        // Mark the death position and surrounding tiles as dangerous
        const radius = config.dangerousAreas.radius;
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const x = position.x + dx;
                const y = position.y + dy;

                // Skip positions outside room boundaries
                if (x < 0 || x > 49 || y < 0 || y > 49) {
                    continue;
                }

                const posKey = `${x},${y}`;

                // Set danger level to maximum (1.0)
                Memory.dangerousAreas[roomName][posKey] = 1.0;

                // Visually mark the dangerous area (optional)
                if (Game.rooms[roomName]) {
                    Game.rooms[roomName].visual.circle(x, y, {
                        fill: 'transparent',
                        radius: 0.5,
                        stroke: 'red',
                        opacity: 0.5
                    });
                }
            }
        }

        console.log(`Marked area around (${position.x},${position.y}) in ${roomName} as dangerous`);
    },
    /**
     * Tracks creep movement on a tile for road building automation
     * @param {RoomPosition} position - The position to track
     * @param {string} roomName - The name of the room
     * @param {Creep} creep - The creep that is moving
     */
    trackTileUsage: function(position, roomName, creep) {
        // Skip tracking if road automation is disabled
        const config = require('config');
        if (!config.roadAutomation.enabled) {
            return;
        }

        // Initialize memory structure if it doesn't exist
        if (!Memory.tileUsage) {
            Memory.tileUsage = {};
        }
        if (!Memory.tileUsage[roomName]) {
            Memory.tileUsage[roomName] = {};
        }

        // Create a key for this position
        const posKey = `${position.x},${position.y}`;

        // Calculate the movement cost based on terrain and creep fatigue
        let movementCost = 1; // Base cost

        // Add cost based on creep's fatigue (if available)
        if (creep && creep.fatigue > 0) {
            // Normalize fatigue to a reasonable range (1-5)
            movementCost += Math.min(5, creep.fatigue / 2);
        }

        // Check terrain type for additional cost
        const terrain = Game.map.getRoomTerrain(roomName);
        const terrainType = terrain.get(position.x, position.y);

        // TERRAIN_MASK_WALL = 1, TERRAIN_MASK_SWAMP = 2, TERRAIN_MASK_LAVA = 4
        if (terrainType === TERRAIN_MASK_SWAMP) {
            movementCost += 5; // Swamps are much more expensive to move through
        }

        // Increment the usage count for this position, weighted by movement cost
        if (!Memory.tileUsage[roomName][posKey]) {
            Memory.tileUsage[roomName][posKey] = movementCost;
        } else {
            Memory.tileUsage[roomName][posKey] += movementCost;
        }
    },

    /**
     * Collects energy from various sources in priority order: tombstones, dropped energy, sources
     * @param {Creep} creep - The creep that will collect energy
     * @returns {boolean} - True if the creep successfully collected or moved to collect energy, false otherwise
     */
    collectEnergy: function(creep) {
        if(creep.store.getFreeCapacity() === 0) {
            return false;
        }

        var tombstones = creep.room.find(FIND_TOMBSTONES, {
            filter: (tombstone) => {
                return tombstone.store[RESOURCE_ENERGY] > 0;
            }
        });
        var droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: (resource) => {
                return resource.resourceType == RESOURCE_ENERGY;
            }
        });
        var sources = creep.room.find(FIND_SOURCES, {
            filter: (source) => {
                return source.energy > 0;
            }
        });

        if (tombstones.length > 0) {
            var target = creep.pos.findClosestByPath(tombstones);
            if (creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.moveTo(creep, target);
            }
            return true;
        }
        else if (droppedEnergy.length > 0) {
            var target = creep.pos.findClosestByPath(droppedEnergy);
            if (creep.pickup(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.moveTo(creep, target);
            }
            return true;
        }
        else if (sources.length > 0) {
            var target = creep.pos.findClosestByPath(sources);
            if(creep.harvest(target) == ERR_NOT_IN_RANGE) {
                this.moveTo(creep, target, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            return true;
        }

        return false;
    },

    /**
     * Moves a creep to a target with path caching for efficiency
     * @param {Creep} creep - The creep to move
     * @param {RoomObject} target - The target to move to
     * @param {Object} opts - Additional options for moveTo
     * @returns {number} - The result of the move operation
     */
    moveTo: function(creep, target, opts = {}) {
        const cacheKey = `${target.x},${target.y},${target.roomName}`;

        // Track the current position for road building automation
        this.trackTileUsage(creep.pos, creep.room.name, creep);

        // Check if the cached path is still valid
        if (creep.memory._move &&
            creep.memory._move.target === cacheKey &&
            creep.memory._move.task === creep.memory.task && // Check if the task is the same
            Game.time - creep.memory._move.tick < 20 &&
            !creep.fatigue
        ) {
            const moveResult = creep.moveByPath(creep.memory._move.path);
            if (moveResult === ERR_NOT_FOUND) {
                delete creep.memory._move;
            } else {
                return moveResult;
            }
        }

        // Add cost matrix for dangerous areas
        const config = require('config');
        if (config.dangerousAreas.enabled && Memory.dangerousAreas && Memory.dangerousAreas[creep.room.name]) {
            // Create a callback to modify the cost matrix
            const costCallback = (roomName, costMatrix) => {
                // Skip if we don't have dangerous areas for this room
                if (!Memory.dangerousAreas[roomName]) {
                    return costMatrix;
                }

                // Create a new cost matrix if one wasn't provided
                if (!costMatrix) {
                    costMatrix = new PathFinder.CostMatrix();
                }

                // Apply cost penalties for dangerous areas
                for (const posKey in Memory.dangerousAreas[roomName]) {
                    const [x, y] = posKey.split(',').map(Number);
                    const dangerLevel = Memory.dangerousAreas[roomName][posKey];

                    // For workers, completely avoid dangerous tiles by setting cost to 255 (impassable)
                    if (creep.memory.role === 'worker') {
                        costMatrix.set(x, y, 255); // Make tile impassable for workers
                    } else {
                        // For other creeps, use the penalty-based approach
                        // Calculate cost penalty based on danger level
                        const penalty = Math.ceil(config.dangerousAreas.costPenalty * dangerLevel);

                        // Get current cost and add penalty
                        const currentCost = costMatrix.get(x, y);
                        const newCost = Math.min(255, currentCost + penalty); // Max cost is 255

                        // Set the new cost
                        costMatrix.set(x, y, newCost);
                    }
                }

                return costMatrix;
            };

            // Add the cost callback to the options
            opts.costCallback = costCallback;
        }

        const moveResult = creep.moveTo(target, {
            visualizePathStyle: { stroke: '#ffffff' },
            reusePath: 5,
            ...opts
        });

        if (moveResult === OK) {
            creep.memory._move = {
                target: cacheKey,
                path: creep.pos.findPathTo(target, opts),
                tick: Game.time,
                task: creep.memory.task // Store the current task in the cached path data
            };
        } else if (moveResult == ERR_NO_PATH){
            delete creep.memory._move;
        }
        return moveResult;
    },

    /**
     * Decays dangerous areas over time and removes them when they expire
     */
    decayDangerousAreas: function() {
        const config = require('config');

        // Skip if dangerous area avoidance is disabled
        if (!config.dangerousAreas.enabled) {
            return;
        }

        // Skip if there are no dangerous areas
        if (!Memory.dangerousAreas) {
            return;
        }

        // Process each room's dangerous areas
        for (const roomName in Memory.dangerousAreas) {
            // Skip if the room has no dangerous areas
            if (!Memory.dangerousAreas[roomName] || Object.keys(Memory.dangerousAreas[roomName]).length === 0) {
                delete Memory.dangerousAreas[roomName];
                continue;
            }

            // Get the room object if we have visibility
            const room = Game.rooms[roomName];

            // Decay all dangerous areas in this room
            for (const posKey in Memory.dangerousAreas[roomName]) {
                // Apply decay rate
                Memory.dangerousAreas[roomName][posKey] *= config.dangerousAreas.decayRate;

                // Round to avoid floating point issues
                Memory.dangerousAreas[roomName][posKey] = Math.round(Memory.dangerousAreas[roomName][posKey] * 1000) / 1000;

                // Remove entries with very low danger levels
                if (Memory.dangerousAreas[roomName][posKey] < 0.01) {
                    delete Memory.dangerousAreas[roomName][posKey];
                    continue;
                }

                // Visually mark the dangerous area if we have visibility
                if (room) {
                    const [x, y] = posKey.split(',').map(Number);
                    const opacity = Memory.dangerousAreas[roomName][posKey] * 0.5; // Scale opacity with danger level
                    room.visual.circle(x, y, {
                        fill: 'transparent',
                        radius: 0.5,
                        stroke: 'red',
                        opacity: opacity
                    });
                }
            }

            // If all dangerous areas in this room have been removed, clean up the room entry
            if (Object.keys(Memory.dangerousAreas[roomName]).length === 0) {
                delete Memory.dangerousAreas[roomName];
            }
        }
    },

    /**
     * Checks tile usage data and creates road construction sites on tiles with high movement cost-weighted usage
     * The likelihood of a tile being turned into a road increases based on both traffic and movement cost
     * @returns {number} - The number of road construction sites created
     */
    buildRoadsOnHighTraffic: function() {
        const config = require('config');

        // Skip if road automation is disabled
        if (!config.roadAutomation.enabled) {
            return 0;
        }

        // Skip if it's not time to check yet
        if (Game.time % config.roadAutomation.checkInterval !== 0) {
            return 0;
        }

        let roadsBuilt = 0;

        // Process each room's tile usage data
        for (const roomName in Memory.tileUsage) {
            const room = Game.rooms[roomName];

            // Skip rooms we don't have visibility in
            if (!room) {
                continue;
            }

            // Get all positions sorted by movement cost-weighted usage (highest first)
            const positions = [];
            for (const posKey in Memory.tileUsage[roomName]) {
                const costWeightedUsage = Memory.tileUsage[roomName][posKey];
                const [x, y] = posKey.split(',').map(Number);
                positions.push({ x, y, costWeightedUsage });
            }

            // Sort by cost-weighted usage (highest first)
            positions.sort((a, b) => b.costWeightedUsage - a.costWeightedUsage);

            // Build roads on the most frequently used positions
            for (const pos of positions) {
                // Stop if we've built enough roads this check
                if (roadsBuilt >= config.roadAutomation.maxRoadsPerCheck) {
                    break;
                }

                // Skip if cost-weighted usage is below threshold
                if (pos.costWeightedUsage < config.roadAutomation.threshold) {
                    continue;
                }

                const position = new RoomPosition(pos.x, pos.y, roomName);

                // Skip if there's already a road or construction site here
                const structures = position.lookFor(LOOK_STRUCTURES);
                const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
                if (hasRoad) {
                    // Reduce the count since there's already a road here
                    Memory.tileUsage[roomName][`${pos.x},${pos.y}`] = 0;
                    continue;
                }

                const sites = position.lookFor(LOOK_CONSTRUCTION_SITES);
                const hasRoadSite = sites.some(s => s.structureType === STRUCTURE_ROAD);
                if (hasRoadSite) {
                    continue;
                }

                // Create a road construction site
                const result = room.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD);
                if (result === OK) {
                    roadsBuilt++;
                    console.log(`Created road construction site at ${pos.x},${pos.y} in ${roomName} (cost-weighted usage: ${pos.costWeightedUsage})`);
                    // Reset the usage for this position
                    Memory.tileUsage[roomName][`${pos.x},${pos.y}`] = 0;
                }
            }

            // Apply decay to all positions
            for (const posKey in Memory.tileUsage[roomName]) {
                Memory.tileUsage[roomName][posKey] *= config.roadAutomation.decayRate;
                // Round to avoid floating point issues
                Memory.tileUsage[roomName][posKey] = Math.round(Memory.tileUsage[roomName][posKey] * 10) / 10;

                // Remove entries with very low counts to keep memory clean
                if (Memory.tileUsage[roomName][posKey] < 0.1) {
                    delete Memory.tileUsage[roomName][posKey];
                }
            }
        }

        return roadsBuilt;
    }
};
