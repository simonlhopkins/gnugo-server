import express from "express";
import { spawn } from "child_process";
import cors from "cors";
import GNUGoProcess from "./GNUGoProcess";
import { createPool } from "generic-pool";

const app = express();
app.use(express.json());
app.use(cors());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const gnugoPool = createPool(
  {
    create: () => Promise.resolve(new GNUGoProcess()),
    destroy: (gnugo) => {
      gnugo.cleanup();
      return Promise.resolve();
    },
  },
  {
    max: 5, // Maximum number of processes in the pool
    min: 1, // Minimum number of processes to keep ready
    idleTimeoutMillis: 30000, // Time a process can remain idle before being closed
    acquireTimeoutMillis: 10000, // Time to wait for a process to become available
  }
);
app.get("/", (req, res) => {
  res.send("gnu go");
});
app.post("/getBestPosition", async (req, res) => {
  const { initialStateMoveList, recentMoveList, size, color, level } = req.body;

  const gnugo = await gnugoPool.acquire();

  try {
    // Populate the board with the initial state and recent moves
    await gnugo.command(`clear_board`);
    await gnugo.command(`boardsize ${size}`);
    await gnugo.command(`level ${level}`);
    for (let move of initialStateMoveList) {
      await gnugo.command(move);
    }
    for (let move of recentMoveList) {
      await gnugo.command(move);
    }

    // Generate the best move for the given color
    const command = `genmove ${color}`;
    const bestMoveResponse = await gnugo.command(command);
    const bestMove = bestMoveResponse.split(" ")[1];

    await gnugo.command("showboard");
    // Respond with the best move
    res.json({ data: bestMove });
  } catch (error) {
    console.error("Error while processing GNUGo command:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    // Ensure the GNUGo process is killed after the response
    if (gnugo) {
      // Release the process back to the pool
      gnugoPool.release(gnugo);
    }
  }
});

app.post("/status", async (req, res) => {
  const { moveList } = req.body;

  const gnugo = await gnugoPool.acquire();
  console.log(moveList);
  try {
    await gnugo.command(`clear_board`);
    await gnugo.command(`boardsize ${9}`);
    for (let move of moveList) {
      await gnugo.command(move);
    }
    const board = await gnugo.command("showboard");
    console.log(board);
    const white = await gnugo.command("final_status_list white_territory");
    const black = await gnugo.command("final_status_list black_territory");
    const komi = await gnugo.command("get_komi");

    const territory = await gnugo.command("final_score");
    console.log("territory" + territory);
    res.json({
      data: {
        komi: komi.split(" ").splice(-1)[0],
        white: white.split(" ").slice(1),
        black: black.split(" ").slice(1),
      },
    });
  } catch (error) {
    console.error("Error while processing GNUGo command:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    if (gnugo) {
      // Release the process back to the pool
      gnugoPool.release(gnugo);
    }
  }
});

const shutdown = async () => {
  console.log("Shutting down server...");

  // Stop accepting new requests and release resources
  await gnugoPool.drain();
  await gnugoPool.clear();

  console.log("All resources released. Exiting.");
  process.exit(0);
};

// Handle termination signals
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);

app.listen(3000, () => {
  console.log("server running on port 3000");
});
