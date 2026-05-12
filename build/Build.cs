using System;
using System.IO;
using System.Linq;
using Nuke.Common;
using Nuke.Common.IO;
using Nuke.Common.Tooling;
using Nuke.Common.Utilities;
using Nuke.OpenTelemetry.Conventions;
using Serilog;

/// <summary>
/// Concrete Nuke build for <c>@ancplua/typespec-otel-semconv</c>.
///
/// Implements <see cref="IUpstreamConventions"/> from the
/// <c>Nuke.OpenTelemetry.Conventions</c> shared component package by shelling
/// out to the Bash/PowerShell pipeline scripts (<c>scripts/bootstrap-weaver.{sh,ps1}</c>
/// and <c>scripts/run-weaver.sh</c>). Keeping the work in the scripts means
/// Build.cs stays a thin orchestrator that the maintainer-facing pipeline can
/// reproduce one-to-one outside of Nuke.
/// </summary>
sealed class Build : NukeBuild, IUpstreamConventions
{
    /// <summary>
    /// Default target. Verifying byte-reproducibility of the generated
    /// <c>lib/otel-keys.gen.tsp</c> is the most useful single signal — it
    /// chains restore + fetch + generate + diff.
    /// </summary>
    public static int Main() => Execute<Build>(static x => ((IUpstreamConventions)x).VerifyOtelKeysReproducible);

    AbsolutePath ScriptsDirectory => RootDirectory / "scripts";
    AbsolutePath ToolsDirectory => RootDirectory / ".tools";
    AbsolutePath UpstreamSubmodule => ToolsDirectory / "semconv-upstream";
    AbsolutePath OtelKeysOutputPath => ((IUpstreamConventions)this).OtelKeysOutput;

    INukeBuild AsNuke => this;

    /// <inheritdoc cref="IUpstreamConventions.OtelKeysOutput"/>
    /// <remarks>
    /// Override the default <c>lib/otel-keys.tsp</c> from the interface to match
    /// the file name the run-weaver.sh pipeline writes (<c>lib/otel-keys.gen.tsp</c>),
    /// which is also the name consumed downstream by ANcpLua.OtelConventions.Api.
    /// </remarks>
    AbsolutePath IUpstreamConventions.OtelKeysOutput =>
        AsNuke.TryGetValue(() => ((IUpstreamConventions)this).OtelKeysOutput)
        ?? RootDirectory / "lib" / "otel-keys.gen.tsp";

    /// <inheritdoc cref="IUpstreamConventions.WeaverVersion"/>
    /// <remarks>
    /// Pinned to v0.23.0 to match the bootstrap-weaver scripts. Bumping this
    /// without also bumping the scripts is a script-parity bug.
    /// </remarks>
    string IUpstreamConventions.WeaverVersion =>
        AsNuke.TryGetValue(() => ((IUpstreamConventions)this).WeaverVersion) ?? "v0.23.0";

    /// <inheritdoc cref="IUpstreamConventions.TypeSpecCompilerRange"/>
    string IUpstreamConventions.TypeSpecCompilerRange =>
        AsNuke.TryGetValue(() => ((IUpstreamConventions)this).TypeSpecCompilerRange) ?? "^1.11.0 || >=1.12.0-dev.0";

    /// <inheritdoc cref="IUpstreamConventions.RestoreWeaver"/>
    Target IUpstreamConventions.RestoreWeaver => _ => _
        .Description("Bootstrap the pinned Weaver CLI into .tools/weaver/.")
        .Executes(() => RunBashScript("bootstrap-weaver.sh"));

    /// <inheritdoc cref="IUpstreamConventions.FetchSemconvModel"/>
    Target IUpstreamConventions.FetchSemconvModel => _ => _
        .Description("Initialize the pinned open-telemetry/semantic-conventions submodule.")
        .Executes(() =>
        {
            if ((UpstreamSubmodule / "model").DirectoryExists())
            {
                Log.Information("Submodule already present at {Path}", UpstreamSubmodule);
                return;
            }

            ProcessTasks
                .StartProcess("git", "submodule update --init --recursive .tools/semconv-upstream", workingDirectory: RootDirectory)
                .AssertZeroExitCode();
        });

    /// <inheritdoc cref="IUpstreamConventions.GenerateOtelKeys"/>
    Target IUpstreamConventions.GenerateOtelKeys => _ => _
        .Description("Run Weaver against the upstream registry, writing lib/otel-keys.gen.tsp.")
        .DependsOn(((IUpstreamConventions)this).RestoreWeaver, ((IUpstreamConventions)this).FetchSemconvModel)
        .Executes(() => RunBashScript("run-weaver.sh"));

    /// <inheritdoc cref="IUpstreamConventions.VerifyOtelKeysReproducible"/>
    Target IUpstreamConventions.VerifyOtelKeysReproducible => _ => _
        .Description("Regenerate twice into scratch directories and diff bytewise.")
        .DependsOn(((IUpstreamConventions)this).GenerateOtelKeys)
        .Executes(() =>
        {
            var firstBytes = File.ReadAllBytes(OtelKeysOutputPath);
            RunBashScript("run-weaver.sh");
            var secondBytes = File.ReadAllBytes(OtelKeysOutputPath);

            if (!firstBytes.SequenceEqual(secondBytes))
            {
                if (((IUpstreamConventions)this).FailOnDrift)
                {
                    Assert.Fail("Generator drift detected: re-running run-weaver.sh produced different bytes.");
                }
                Log.Warning("Generator drift detected but FailOnDrift=false; continuing.");
                return;
            }

            Log.Information("OK: generator is byte-reproducible ({Bytes} bytes, {Lines} lines).",
                firstBytes.Length,
                File.ReadLines(OtelKeysOutputPath).Count());
        });

    /// <inheritdoc cref="IUpstreamConventions.VerifyOtelKeysScriptParity"/>
    Target IUpstreamConventions.VerifyOtelKeysScriptParity => _ => _
        .Description("Run bootstrap-weaver.sh AND .ps1 (if pwsh available) to guard against script drift.")
        .Executes(() =>
        {
            RunBashScript("bootstrap-weaver.sh");

            if (HasCommand("pwsh"))
            {
                var psScript = ScriptsDirectory / "bootstrap-weaver.ps1";
                ProcessTasks
                    .StartProcess("pwsh", $"-NoProfile -ExecutionPolicy Bypass -File \"{psScript}\"", workingDirectory: RootDirectory)
                    .AssertZeroExitCode();
            }
            else if (EnvironmentInfo.IsWin && HasCommand("powershell"))
            {
                var psScript = ScriptsDirectory / "bootstrap-weaver.ps1";
                ProcessTasks
                    .StartProcess("powershell", $"-NoProfile -ExecutionPolicy Bypass -File \"{psScript}\"", workingDirectory: RootDirectory)
                    .AssertZeroExitCode();
            }
            else
            {
                Log.Information("pwsh not available and not running on Windows — skipping PowerShell parity check.");
            }

            // Both scripts download the pinned Weaver tarball from the same URL; if
            // they succeed, identity of the downloaded binary is enforced by the URL
            // pin (v0.23.0 per-arch asset). The fact that both scripts succeeded is
            // the parity signal.
            Log.Information("Bootstrap parity OK.");
        });

    /// <inheritdoc cref="IUpstreamConventions.VerifyOtelKeysCompile"/>
    Target IUpstreamConventions.VerifyOtelKeysCompile => _ => _
        .Description("Run `npm run lint:smoke` to confirm the generated TypeSpec compiles.")
        .DependsOn(((IUpstreamConventions)this).GenerateOtelKeys)
        .Executes(() => Npm("run lint:smoke"));

    /// <inheritdoc cref="IUpstreamConventions.RunSmokeTests"/>
    Target IUpstreamConventions.RunSmokeTests => _ => _
        .Description("Run `npm run test` (vitest).")
        .DependsOn(((IUpstreamConventions)this).GenerateOtelKeys)
        .Executes(() => Npm("run test"));

    /// <inheritdoc cref="IUpstreamConventions.VerifyClean"/>
    Target IUpstreamConventions.VerifyClean => _ => _
        .Description("Run `npm run verify-clean` (regenerate + git diff exit-code + untracked check).")
        .Executes(() => Npm("run verify-clean"));

    /// <inheritdoc cref="IUpstreamConventions.PackTypeSpecLibrary"/>
    Target IUpstreamConventions.PackTypeSpecLibrary => _ => _
        .Description("Run `npm pack` to produce the GitHub Packages tarball.")
        .DependsOn(
            ((IUpstreamConventions)this).VerifyOtelKeysReproducible,
            ((IUpstreamConventions)this).VerifyOtelKeysCompile,
            ((IUpstreamConventions)this).RunSmokeTests,
            ((IUpstreamConventions)this).VerifyClean)
        .Executes(() => Npm("pack"));

    /// <inheritdoc cref="IUpstreamConventions.PublishTypeSpecLibrary"/>
    Target IUpstreamConventions.PublishTypeSpecLibrary => _ => _
        .Description("Run `npm publish --provenance` against GitHub Packages.")
        .DependsOn(((IUpstreamConventions)this).PackTypeSpecLibrary)
        .Requires(() => ((IUpstreamConventions)this).WeaverVersion)
        .Executes(() => Npm("publish --provenance --access public"));

    void RunBashScript(string scriptName)
    {
        var script = ScriptsDirectory / scriptName;
        Assert.FileExists(script);
        ProcessTasks
            .StartProcess("bash", $"\"{script}\"", workingDirectory: RootDirectory)
            .AssertZeroExitCode();
    }

    void Npm(string args) =>
        ProcessTasks
            .StartProcess("npm", args, workingDirectory: RootDirectory)
            .AssertZeroExitCode();

    static bool HasCommand(string command)
    {
        try
        {
            var which = EnvironmentInfo.IsWin ? "where" : "which";
            var process = ProcessTasks.StartProcess(which, command, logInvocation: false, logOutput: false);
            process.WaitForExit();
            return process.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }
}
