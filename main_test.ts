import { TextProtoReader } from "std/textproto/mod.ts";
import { assert, assertEquals } from "std/testing/asserts.ts";
import { BufReader } from "std/io/bufio.ts";
import { delay } from "std/async/delay.ts";
import { dirname, fromFileUrl } from "std/path/mod.ts";

const moduleDir = dirname(fromFileUrl(import.meta.url));

Deno.test("Hello Test", () => {
  assert("Hello");
});

Deno.test({
  name: "destroyed connection",
  fn: async (): Promise<void> => {
    // Runs a simple server as another process
    const p = Deno.run({
      cmd: [
        Deno.execPath(),
        "run",
        "--unstable",
        "--importmap=import_map.json",
        "--allow-net",
        "main.ts",
      ],
      cwd: moduleDir,
      stdout: "piped",
    });

    let serverIsRunning = true;
    const statusPromise = p
      .status()
      .then((): void => {
        serverIsRunning = false;
      })
      .catch((_): void => {}); // Ignores the error when closing the process.

    try {
      const r = new TextProtoReader(new BufReader(p.stdout));
      const s = await r.readLine();
      assert(s !== null && s.includes("http://localhost:3000/"));
      await delay(100);
      // Reqeusts to the server and immediately closes the connection
      const conn = await Deno.connect({ port: 3000 });
      await conn.write(new TextEncoder().encode("GET / HTTP/1.0\n\n"));
      const abc: Uint8Array = new Uint8Array(100);
      await conn.read(abc);
      conn.close();
      //console.log(new TextDecoder().decode(abc));
      assert(new TextDecoder().decode(abc).includes("Hello World"));
      // Waits for the server to handle the above (broken) request
      await delay(100);
      assert(serverIsRunning);
    } finally {
      // Stops the sever and allows `p.status()` promise to resolve
      Deno.kill(p.pid, Deno.Signal.SIGKILL);
      await statusPromise;
      p.stdout.close();
      p.close();
    }
  },
});
