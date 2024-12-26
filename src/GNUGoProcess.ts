import { ChildProcessWithoutNullStreams, spawn } from "child_process";

class GNUGoProcess {
  gnugoProcess?: ChildProcessWithoutNullStreams;
  commandId: number = 0;
  isInitialized: boolean = false;

  constructor() {
    console.log("creating new GNUGo process...");
    try {
      this.gnugoProcess = spawn("gnugo", [
        "--mode",
        "gtp",
        "--score",
        "finish",
        "--capture-all-dead",
        "--chinese-rules",
      ]);

      let responseBuffer = "";

      this.gnugoProcess.stdout.on("data", (data) => {
        responseBuffer += data.toString();
        if (responseBuffer.endsWith("\n\n")) {
          // Emit the complete response and clear the buffer
          this.gnugoProcess?.emit("response", responseBuffer.trim());
          responseBuffer = "";
        }
      });

      this.gnugoProcess.on("error", (error) => {
        console.error("Error spawning GNUGo process:", error.message);
        this.cleanup(); // Cleanup any partially initialized resources
      });

      this.gnugoProcess.on("exit", (code) => {
        if (code === 0) {
          console.log("GNUGo process exited successfully.");
        } else {
          console.error(`GNUGo process exited with code ${code}.`);
        }
      });

      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize GNUGo process:", error);
    }
  }

  command(command: string): Promise<string> {
    if (!this.isInitialized || !this.gnugoProcess) {
      return Promise.reject(new Error("GNUGo process is not initialized."));
    }
    console.log(`command: ${command}`);
    const commandId = this.commandId++;
    return new Promise((resolve, reject) => {
      this.gnugoProcess!.once("response", (response: string) => {
        if (response.startsWith(`=${commandId}`)) {
          resolve(response);
        } else if (response.startsWith(`?${commandId}`)) {
          resolve(response);
        } else {
          reject(new Error(`Unexpected response: ${response}`));
        }
      });

      this.gnugoProcess!.stdin.write(
        `${commandId} ${command.trim()}\n`,
        (err) => {
          if (err) {
            reject(
              new Error(`Failed to write command to GNUGo: ${err.message}`)
            );
          }
        }
      );
    });
  }

  cleanup() {
    console.log("cleaning up gnugo process...");
    if (this.gnugoProcess) {
      this.command("quit");
      this.gnugoProcess.kill();
      this.gnugoProcess = undefined;
    }
  }
}

export default GNUGoProcess;
