var utils = require('utils');
var config = require('config');

var roleWorker = {
    /**
     * Determines the most needed role in the colony.
     * Accepts pre-computed task counts from the main loop to avoid redundant Game.creeps scans.
     * @param {Room} room - The room to check
     * @param {Object} counts - Pre-computed { harvesters, upgraders, builders } lengths
     * @returns {string} - The role that is most needed ('harvesting', 'upgrading', or 'building')
     */
    determineRole: function(room, counts) {
        // Fall back to a local scan only if counts weren't provided (e.g. called outside main loop)
        if (!counts) {
            var allWorkers = _.filter(Game.creeps, (c) => c.memory.role == 'worker');
            counts = {
                harvesters: _.filter(allWorkers, (c) => c.memory.currentTask == 'harvesting').length,
                upgraders:  _.filter(allWorkers, (c) => c.memory.currentTask == 'upgrading').length,
                builders:   _.filter(allWorkers, (c) => c.memory.currentTask == 'building').length,
            };
        }

        // Check if we need harvesters (highest priority)
        if (counts.harvesters < config.creepCounts.harvester) {
            return 'harvesting';
        }

        // Check if we need upgraders (second priority)
        if (counts.upgraders < config.creepCounts.upgrader) {
            return 'upgrading';
        }

        // Check if we need builders (third priority)
        if (counts.builders < config.creepCounts.builder) {
            return 'building';
        }

        // If all roles are filled, check if there are construction sites or repairs needed
        var constructionSites = room.find(FIND_CONSTRUCTION_SITES);
        var repairTargets = room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.hits/structure.hitsMax) < config.structures.repairThreshold;
            }
        });

        if (constructionSites.length > 0 || repairTargets.length > 0) {
            return 'building';
        }

        // Default to upgrading if no specific needs
        return 'upgrading';
    },

    /**
     * Performs harvesting tasks (collecting energy and transferring to structures)
     * @param {Creep} creep - The creep to run the harvesting logic on
     * @param {Object} counts - Pre-computed task counts
     */
    runHarvester: function(creep, counts) {
        // Initialize gathering flag if not set
        if(creep.memory.gathering === undefined) {
            creep.memory.gathering = creep.store.getFreeCapacity() > 0;
        }

        // If we're gathering and we're full, stop gathering
        if(creep.memory.gathering && creep.store.getFreeCapacity() == 0) {
            creep.memory.gathering = false;
            creep.say('🚚 deliver');
        }

        // If we're not gathering and we're empty, start gathering
        if(!creep.memory.gathering && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.gathering = true;
            creep.say('🔄 harvest');
        }

        if(creep.memory.gathering) {
            utils.collectEnergy(creep);
        }
        else {
            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_TOWER) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
            if(targets.length > 0) {
                if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    utils.moveTo(creep, targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
            // If no structures need energy, switch to another role
            else {
                creep.memory.currentTask = this.determineRole(creep.room, counts);
                creep.say('🔄 ' + creep.memory.currentTask);
            }
        }
    },

    /**
     * Performs upgrading tasks (upgrading the controller)
     * @param {Creep} creep - The creep to run the upgrading logic on
     * @param {Object} counts - Pre-computed task counts (unused here, kept for API consistency)
     */
    runUpgrader: function(creep, counts) {
        // Initialize gathering flag if not set
        if(creep.memory.gathering === undefined) {
            creep.memory.gathering = creep.store[RESOURCE_ENERGY] == 0;
        }

        // If we're gathering and we're full, stop gathering
        if(creep.memory.gathering && creep.store.getFreeCapacity() == 0) {
            creep.memory.gathering = false;
            creep.say('⚡ upgrade');
        }

        // If we're not gathering and we're empty, start gathering
        if(!creep.memory.gathering && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.gathering = true;
            creep.say('🔄 harvest');
        }

        if(creep.memory.gathering) {
            utils.collectEnergy(creep);
        }
        else {
            if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                utils.moveTo(creep, creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    },

    /**
     * Performs building tasks (building construction sites and repairing structures)
     * @param {Creep} creep - The creep to run the building logic on
     * @param {Object} counts - Pre-computed task counts
     */
    runBuilder: function(creep, counts) {
        // Initialize gathering flag if not set
        if(creep.memory.gathering === undefined) {
            creep.memory.gathering = creep.store[RESOURCE_ENERGY] == 0;
        }

        // If we're gathering and we're full, stop gathering
        if(creep.memory.gathering && creep.store.getFreeCapacity() == 0) {
            creep.memory.gathering = false;
            creep.say('🚧 build');
        }

        // If we're not gathering and we're empty, start gathering
        if(!creep.memory.gathering && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.gathering = true;
            creep.say('🔄 harvest');
        }

        if(creep.memory.gathering) {
            utils.collectEnergy(creep);
        }
        else {
            // Priority order for construction: spawn > extension > tower > storage > container > road > wall
            var targets = creep.room.find(FIND_CONSTRUCTION_SITES);

            if(targets.length) {
                // Use priority order from config
                const priorityOrder = config.structures.buildPriority;

                // Find the spawn to use as a focus point for tie-breaking
                const spawns = creep.room.find(FIND_MY_SPAWNS);
                const anchor = spawns.length ? spawns[0] : creep;

                // Sort targets by priority
                targets.sort((a, b) => {
                    const priorityA = priorityOrder.indexOf(a.structureType);
                    const priorityB = priorityOrder.indexOf(b.structureType);

                    if (priorityA === priorityB) {
                        // If same priority, choose the one closest to the spawn so all
                        // builders converge on the same site and finish it quickly.
                        const distanceA = anchor.pos.getRangeTo(a);
                        const distanceB = anchor.pos.getRangeTo(b);
                        return distanceA - distanceB;
                    }

                    return priorityA - priorityB;
                });

                // Build the highest priority target
                if(creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
                    utils.moveTo(creep, targets[0], {visualizePathStyle: config.pathVisuals.build});
                }
            }
            else {
                // Priority order for repairs: critical structures first, then by damage percentage
                targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (structure.hits/structure.hitsMax) < config.structures.repairThreshold;
                    }
                });

                if(targets.length) {
                    // Sort by damage percentage (most damaged first)
                    targets.sort((a, b) => {
                        const ratioA = a.hits / a.hitsMax;
                        const ratioB = b.hits / b.hitsMax;
                        return ratioA - ratioB;
                    });

                    if(creep.repair(targets[0]) == ERR_NOT_IN_RANGE) {
                        utils.moveTo(creep, targets[0], {visualizePathStyle: config.pathVisuals.repair});
                    }
                }
                // If nothing to build or repair, switch to another role
                else {
                    creep.memory.currentTask = this.determineRole(creep.room, counts);
                    creep.say('🔄 ' + creep.memory.currentTask);
                }
            }
        }
    },

    /** @param {Creep} creep @param {Object} counts - Pre-computed task counts **/
    run: function(creep, counts) {
        // Initialize currentTask if not set
        if(!creep.memory.currentTask) {
            creep.memory.currentTask = this.determineRole(creep.room, counts);
            creep.say('🔄 ' + creep.memory.currentTask);
        }

        // We prioritize the current task and only switch when there are no more tasks available
        // This is handled in the individual role functions (runHarvester, runBuilder)

        // Each role function uses a 'gathering' flag to ensure workers don't stop gathering energy
        // until they are completely full, as per the requirement

        // Run the appropriate role logic
        if(creep.memory.currentTask === 'harvesting') {
            this.runHarvester(creep, counts);
        }
        else if(creep.memory.currentTask === 'upgrading') {
            this.runUpgrader(creep, counts);
        }
        else if(creep.memory.currentTask === 'building') {
            this.runBuilder(creep, counts);
        }
    }
};

module.exports = roleWorker;
