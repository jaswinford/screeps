module.exports = {
    /**
     * Tracks creep movement on a tile for road building automation
     * @param {RoomPosition} position - The position to track
     * @param {string} roomName - The name of the room
     */
    trackTileUsage: function(position, roomName) {
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

        // Increment the usage count for this position
        if (!Memory.tileUsage[roomName][posKey]) {
            Memory.tileUsage[roomName][posKey] = 1;
        } else {
            Memory.tileUsage[roomName][posKey]++;
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
        this.trackTileUsage(creep.pos, creep.room.name);

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
     * Checks tile usage data and creates road construction sites on frequently used tiles
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

            // Get all positions sorted by usage count (highest first)
            const positions = [];
            for (const posKey in Memory.tileUsage[roomName]) {
                const count = Memory.tileUsage[roomName][posKey];
                const [x, y] = posKey.split(',').map(Number);
                positions.push({ x, y, count });
            }

            // Sort by count (highest first)
            positions.sort((a, b) => b.count - a.count);

            // Build roads on the most frequently used positions
            for (const pos of positions) {
                // Stop if we've built enough roads this check
                if (roadsBuilt >= config.roadAutomation.maxRoadsPerCheck) {
                    break;
                }

                // Skip if usage count is below threshold
                if (pos.count < config.roadAutomation.threshold) {
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
                    console.log(`Created road construction site at ${pos.x},${pos.y} in ${roomName} (usage: ${pos.count})`);
                    // Reset the count for this position
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
