"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import type { TechSection } from "@/lib/sections-data"

interface DomainSectionProps {
  section: TechSection
  index: number
}

export function DomainSection({ section, index }: DomainSectionProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  const isEven = index % 2 === 0

  return (
    <section
      id={section.id}
      ref={ref}
      className="relative border-b border-border"
    >
      <div className={`mx-auto max-w-7xl px-4 py-20 lg:px-8 lg:py-32`}>
        {/* Grid layout - alternates content/visual */}
        <div className={`grid gap-12 lg:grid-cols-2 lg:gap-16 lg:items-center`}>
          {/* Left: Text content */}
          <motion.div
            initial={{ opacity: 0, x: isEven ? -40 : 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: isEven ? -40 : 40 }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={isEven ? "" : "lg:order-2"}
          >
            <div className="mb-6 flex items-end gap-4">
              <span className="font-mono text-7xl font-bold text-border">
                {section.number}
              </span>
              <h2 className="text-3xl font-bold text-foreground md:text-4xl">
                {section.title}
              </h2>
            </div>
            <p className="mb-4 font-mono text-sm text-muted-foreground">
              {section.subtitle}
            </p>
            <p className="mb-8 max-w-md font-mono leading-relaxed text-muted-foreground">
              {section.description}
            </p>

            {/* Specs Grid */}
            <div className="mb-8 grid grid-cols-2 gap-3">
              {section.specs.map((spec, i) => (
                <div
                  key={i}
                  className="border border-border bg-secondary/30 p-3"
                >
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">
                    {spec.label}
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-foreground">
                    {spec.value}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: ASCII + Terminal */}
          <motion.div
            initial={{ opacity: 0, x: isEven ? 40 : -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: isEven ? 40 : -40 }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 }}
            className={isEven ? "lg:order-2" : ""}
          >
            {/* ASCII Art */}
            <div className="mb-6 border border-border bg-secondary/20 p-4">
              <pre className="overflow-x-auto font-mono text-[8px] leading-[10px] text-foreground/60 md:text-[9px] md:leading-[11px]">
                {section.ascii}
              </pre>
            </div>

            {/* Terminal Commands */}
            <div className="border border-border bg-background">
              <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-2">
                <span className="text-[10px] font-mono text-muted-foreground">
                  TERMINAL • {section.title.toUpperCase()}
                </span>
              </div>
              <div className="p-4 font-mono text-[10px] leading-relaxed text-foreground/80 md:text-xs">
                {section.commands.map((cmd, i) => (
                  <div
                    key={i}
                    className={
                      cmd.startsWith("$")
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {cmd}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
