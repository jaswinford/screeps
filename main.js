var roleWorker = require('role.worker');
var config = require('config');
var utils = require('utils');

module.exports.loop = function () {
    // Use excess CPU to generate pixels based on configuration
    if (config.cpu.generatePixels && Game.cpu.bucket >= config.cpu.minBucketLevel) {
        // Only generate pixels if we're above our target bucket level or at max capacity
        if (Game.cpu.bucket >= config.cpu.targetBucketLevel) {
            try {
                Game.cpu.generatePixel();
                console.log(`Generated a pixel. CPU bucket: ${Game.cpu.bucket}`);
            }
            catch (err) {
                console.log(`Failed to generate pixel: ${err}`);
            }
        }
    }

    // Check for creep deaths and mark dangerous areas
    for (var name in Memory.creeps) {
        if (!Game.creeps[name]) {
            // Check if we have position data for this creep
            if (Memory.creeps[name].lastPosition) {
                const pos = Memory.creeps[name].lastPosition;
                const roomName = pos.roomName;
                const ticksToLive = Memory.creeps[name].ticksToLive;

                // Create a RoomPosition object
                const position = new RoomPosition(pos.x, pos.y, roomName);

                // Only mark the area as dangerous if the creep was killed (ticksToLive > 5)
                // If ticksToLive is low, it likely died naturally
                if (ticksToLive > 5) {
                    utils.markDangerousArea(position, roomName);
                    console.log(`Creep ${name} was killed at (${pos.x},${pos.y}) in ${roomName} with ${ticksToLive} ticks left. Marking area as dangerous.`);
                } else {
                    console.log(`Creep ${name} died naturally at (${pos.x},${pos.y}) in ${roomName} with ${ticksToLive} ticks left. Not marking as dangerous.`);
                }
            }

            // Clean up the creep's memory
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }

    // Decay dangerous areas
    utils.decayDangerousAreas();

    // Check for high traffic areas and build roads
    utils.buildRoadsOnHighTraffic();

    // Check if spawn is full and build additional energy storage if needed
    for (const roomName in Game.rooms) {
        utils.buildEnergyStorageWhenSpawnFull(Game.rooms[roomName]);
    }

    // Resolve the active spawn — avoids hardcoding 'Spawn1' throughout
    var spawn = _.first(_.values(Game.spawns));
    if (!spawn) {
        return; // No spawn available this tick; nothing to do
    }

    var workers = _.filter(Game.creeps, (creep) => creep.memory.role == 'worker');

    // Count workers by current task — computed once per tick and reused everywhere
    var allWorkers = workers; // already filtered above
    var counts = {
        harvesters: _.filter(allWorkers, (c) => c.memory.currentTask == 'harvesting').length,
        upgraders:  _.filter(allWorkers, (c) => c.memory.currentTask == 'upgrading').length,
        builders:   _.filter(allWorkers, (c) => c.memory.currentTask == 'building').length,
    };

    // Determine which body parts to use based on available energy
    var energyAvailable = spawn.room.energyAvailable;
    var bodyParts;

    if (energyAvailable >= 800) {
        bodyParts = config.creepBodyParts.advanced;
    } else if (energyAvailable >= 550) {
        bodyParts = config.creepBodyParts.standard;
    } else {
        bodyParts = config.creepBodyParts.basic;
    }

    // Spawn workers if we need more
    if (workers.length < config.creepCounts.worker) {
        // Determine initial task based on colony needs
        var initialTask = 'harvesting'; // Default to harvesting

        if (counts.harvesters >= config.creepCounts.harvester) {
            if (counts.upgraders < config.creepCounts.upgrader) {
                initialTask = 'upgrading';
            } else if (counts.builders < config.creepCounts.builder) {
                initialTask = 'building';
            }
        }

        var newName = 'Worker' + Game.time;
        spawn.spawnCreep(bodyParts.worker, newName, {
            memory: {
                role: 'worker',
                currentTask: initialTask
            }
        });
    }

    if (spawn.spawning) {
        var spawningCreep = Game.creeps[spawn.spawning.name];
        spawn.room.visual.text(
            '🛠️' + spawningCreep.memory.role + (spawningCreep.memory.currentTask ? ' (' + spawningCreep.memory.currentTask + ')' : ''),
            spawn.pos.x + 1,
            spawn.pos.y,
            {align: 'left', opacity: 0.8});
    }

    for (var name in Game.creeps) {
        var creep = Game.creeps[name];

        // Store the creep's current position and ticksToLive for death detection
        creep.memory.lastPosition = {
            x: creep.pos.x,
            y: creep.pos.y,
            roomName: creep.room.name
        };
        creep.memory.ticksToLive = creep.ticksToLive;

        if (creep.memory.role == 'worker') {
            roleWorker.run(creep, counts);
        }
        // Support for legacy creeps (if any still exist)
        else if (creep.memory.role == 'harvester') {
            creep.memory.role = 'worker';
            creep.memory.currentTask = 'harvesting';
            roleWorker.run(creep, counts);
        }
        else if (creep.memory.role == 'upgrader') {
            creep.memory.role = 'worker';
            creep.memory.currentTask = 'upgrading';
            roleWorker.run(creep, counts);
        }
        else if (creep.memory.role == 'builder') {
            creep.memory.role = 'worker';
            creep.memory.currentTask = 'building';
            roleWorker.run(creep, counts);
        }
    }
}
